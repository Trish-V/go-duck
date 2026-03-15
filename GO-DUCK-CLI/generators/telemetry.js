import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateTelemetryCode = async (config, outputDir) => {
    const telemetryDir = path.join(outputDir, 'internal/telemetry');
    const k8sDir = path.join(outputDir, 'k8s');

    await fs.ensureDir(telemetryDir);
    await fs.ensureDir(k8sDir);

    const otelGo = `
package telemetry

import (
	"context"
	"fmt"
	"log"
	"time"

	"{{app_name}}/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.12.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// InitTelemetry initializes OpenTelemetry SDK
func InitTelemetry(cfg *config.Config) (func(context.Context) error, error) {
	if !cfg.GoDuck.Telemetry.OTel.Enabled {
		log.Println("OpenTelemetry is disabled.")
		return func(context.Context) error { return nil }, nil
	}

	ctx := context.Background()

	// 1. Setup Resource
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(cfg.GoDuck.Name),
			semconv.ServiceVersionKey.String(cfg.GoDuck.Version),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// 2. Setup OTLP Exporter (gRPC)
	conn, err := grpc.DialContext(ctx, cfg.GoDuck.Telemetry.OTel.Endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC connection to OTel collector: %w", err)
	}

	traceExporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// 3. Setup Tracer Provider
	bsp := sdktrace.NewBatchSpanProcessor(traceExporter)
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.GoDuck.Telemetry.OTel.SamplerRatio)),
		sdktrace.WithResource(res),
		sdktrace.WithSpanProcessor(bsp),
	)
	otel.SetTracerProvider(tp)

	// 4. Setup Text Map Propagator
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	log.Printf("OpenTelemetry initialized with endpoint: %s", cfg.GoDuck.Telemetry.OTel.Endpoint)

	return tp.Shutdown, nil
}
`;

    const otelCollectorK8s = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-conf
  labels:
    app: {{app_name}}
data:
  otel-collector-config.yaml: |
    receivers:
      otlp:
        protocols:
          grpc:
          http:
    processors:
      batch:
      resourcedetection:
        detectors: [env, system]
    exporters:
      logging:
        loglevel: debug
      otlp:
        endpoint: "jaeger-collector:4317"
        tls:
          insecure: true
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch, resourcedetection]
          exporters: [logging, otlp]
`;

    await fs.writeFile(path.join(telemetryDir, 'otel.go'), otelGo.replace(/{{app_name}}/g, config.name));
    await fs.writeFile(path.join(k8sDir, 'otel-collector.yml'), otelCollectorK8s.replace(/{{app_name}}/g, config.name));

    console.log(chalk.gray('  Generated OpenTelemetry Telemetry Package & K8s Config'));
};
