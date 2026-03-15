import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateLoggerCode = async (config, outputDir) => {
    const loggerDir = path.join(outputDir, 'logger');
    await fs.ensureDir(loggerDir);

    const loggerGo = `
package logger

import (
	"log"
	"os"
	"{{app_name}}/config"

	"github.com/DataDog/datadog-go/statsd"
)

var (
	Statsd *statsd.Client
)

// InitLogger initializes the application logging and monitoring
func InitLogger(cfg *config.Config) {
	if cfg.GoDuck.Logging.Datadog.Enabled {
		log.Printf("Initializing Datadog Monitoring for service: %s", cfg.GoDuck.Logging.Datadog.Service)
		
		// In a real implementation, you'd use a Datadog logging hook or library
		// Here we initialize Statsd as an example of DD integration
		client, err := statsd.New("127.0.0.1:8125")
		if err == nil {
			Statsd = client
			Statsd.Namespace = cfg.GoDuck.Logging.Datadog.Service + "."
			Statsd.Tags = []string{"environment:" + cfg.Environment.ActiveProfile}
		} else {
			log.Printf("Warning: Failed to initialize Datadog statsd: %v", err)
		}
	} else {
		log.Println("Datadog logging is disabled. Using standard console output.")
	}

	// Set standard logger output
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.SetOutput(os.Stdout)
}

// Info logs information messages
func Info(format string, v ...interface{}) {
	log.Printf("[INFO] "+format, v...)
}

// Error logs error messages
func Error(format string, v ...interface{}) {
	log.Printf("[ERROR] "+format, v...)
}

// Trace metric (example of DD analytics)
func TraceMetric(name string, value float64, tags []string) {
	if Statsd != nil {
		Statsd.Gauge(name, value, tags, 1)
	}
}
`;

    await fs.writeFile(path.join(loggerDir, 'logger.go'), loggerGo.replace(/{{app_name}}/g, config.name));
    console.log(chalk.gray('  Generated Datadog-ready Logger Package'));
};
