
package telemetry

import (
	"context"
	"fmt"
	"log"

	"go-duck/config"
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
