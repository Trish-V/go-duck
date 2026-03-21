import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateConfigLoader = async (outputDir) => {
	const configDir = path.join(outputDir, 'config');
	await fs.ensureDir(configDir);

	const configGo = `
package config

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/viper"
	"strings"
)

type Config struct {
	GoDuck struct {
		Name        string \`mapstructure:"name"\`
		Version     string \`mapstructure:"version"\`
		Description string \`mapstructure:"description"\`
		
		Server struct {
			Port         int           \`mapstructure:"port"\`
			ReadTimeout  time.Duration \`mapstructure:"read-timeout"\`
			WriteTimeout time.Duration \`mapstructure:"write-timeout"\`
			GRPC struct {
				Addr    string        \`mapstructure:"addr"\`
				Network string        \`mapstructure:"network"\`
				Timeout time.Duration \`mapstructure:"timeout"\`
			} \`mapstructure:"grpc"\`
			CORS struct {
				AllowOrigins []string \`mapstructure:"allow-origins"\`
				AllowMethods []string \`mapstructure:"allow-methods"\`
				AllowHeaders []string \`mapstructure:"allow-headers"\`
			} \`mapstructure:"cors"\`
		} \`mapstructure:"server"\`

		Security struct {
			KeycloakHost     string \`mapstructure:"keycloak-host"\`
			KeycloakRealm    string \`mapstructure:"keycloak-realm"\`
			KeycloakClientID string \`mapstructure:"keycloak-client-id"\`
			KeycloakSecret   string \`mapstructure:"keycloak-secret"\`
			RateLimit        struct {
				RPS   float64 \`mapstructure:"rps"\`
				Burst int     \`mapstructure:"burst"\`
			} \`mapstructure:"rate-limit"\`
		} \`mapstructure:"security"\`

		Logging struct {
			Datadog struct {
				Enabled bool   \`mapstructure:"enabled"\`
				APIKey  string \`mapstructure:"api-key"\`
				Site    string \`mapstructure:"site"\`
				Service string \`mapstructure:"service"\`
			} \`mapstructure:"datadog"\`
		} \`mapstructure:"logging"\`

		Messaging struct {
			MQTT struct {
				Enabled     bool   \`mapstructure:"enabled"\`
				Broker      string \`mapstructure:"broker"\`
				ClientID    string \`mapstructure:"client-id"\`
				Username    string \`mapstructure:"username"\`
				Password    string \`mapstructure:"password"\`
				TopicPrefix string \`mapstructure:"topic-prefix"\`
			} \`mapstructure:"mqtt"\`
		} \`mapstructure:"messaging"\`

		Cache struct {
			Redis struct {
				Enabled  bool          \`mapstructure:"enabled"\`
				Host     string        \`mapstructure:"host"\`
				Password string        \`mapstructure:"password"\`
				DB       int           \`mapstructure:"db"\`
				TTL      time.Duration \`mapstructure:"ttl"\`
			} \`mapstructure:"redis"\`
		} \`mapstructure:"cache"\`

		Telemetry struct {
			OTel struct {
				Enabled      bool    \`mapstructure:"enabled"\`
				Endpoint     string  \`mapstructure:"endpoint"\`
				SamplerRatio float64 \`mapstructure:"sampler-ratio"\`
			} \`mapstructure:"otel"\`
		} \`mapstructure:"telemetry"\`

		Resilience struct {
			CircuitBreaker struct {
				Enabled            bool \`mapstructure:"enabled"\`
				FailureThreshold   uint32 \`mapstructure:"failure-threshold"\`
				SuccessThreshold   uint32 \`mapstructure:"success-threshold"\`
				Timeout            time.Duration \`mapstructure:"timeout"\`
			} \`mapstructure:"circuit-breaker"\`
		} \`mapstructure:"resilience"\`

		Multitenancy struct {
			Enabled bool \`mapstructure:"enabled"\`
		} \`mapstructure:"multitenancy"\`

		Datasource struct {
			Host            string        \`mapstructure:"host"\`
			Port            int           \`mapstructure:"port"\`
			Username        string        \`mapstructure:"username"\`
			Password        string        \`mapstructure:"password"\`
			Database        string        \`mapstructure:"database"\`
			SSLMode         string        \`mapstructure:"ssl-mode"\`
			MaxOpenConns    int           \`mapstructure:"max-open-conns"\`
			MaxIdleConns    int           \`mapstructure:"max-idle-conns"\`
			ConnMaxLifetime time.Duration \`mapstructure:"conn-max-lifetime"\`
		} \`mapstructure:"datasource"\`
	} \`mapstructure:"go-duck"\`
	Environment struct {
		ActiveProfile string \`mapstructure:"active_profile"\`
	} \`mapstructure:"environment"\`
}

func LoadConfig() (*Config, error) {
	v := viper.New()

	profile := os.Getenv("GO_PROFILE")
	if profile == "" {
		profile = "dev"
	}

	v.SetConfigName(fmt.Sprintf("application-%s", profile))
	v.SetConfigType("yml")
	v.AddConfigPath(".")

	// Default values
	v.SetDefault("go-duck.server.port", 8080)
	v.SetDefault("go-duck.security.rate-limit.rps", 100.0)
	v.SetDefault("go-duck.security.rate-limit.burst", 200)
	v.SetDefault("go-duck.logging.datadog.enabled", false)
	v.SetDefault("go-duck.logging.datadog.site", "datadoghq.com")
	v.SetDefault("go-duck.messaging.mqtt.enabled", false)
	v.SetDefault("go-duck.messaging.mqtt.topic-prefix", "go-duck/events")
	v.SetDefault("go-duck.cache.redis.enabled", false)
	v.SetDefault("go-duck.cache.redis.ttl", "10m")
	v.SetDefault("go-duck.telemetry.otel.enabled", false)
	v.SetDefault("go-duck.telemetry.otel.endpoint", "localhost:4317")
	v.SetDefault("go-duck.telemetry.otel.sampler-ratio", 1.0)
	v.SetDefault("go-duck.server.grpc.addr", ":9000")
	v.SetDefault("go-duck.server.grpc.network", "tcp")
	v.SetDefault("go-duck.server.grpc.timeout", "1s")
	v.SetDefault("go-duck.resilience.circuit-breaker.enabled", true)
	v.SetDefault("go-duck.resilience.circuit-breaker.failure-threshold", 5)
	v.SetDefault("go-duck.resilience.circuit-breaker.timeout", "60s")

	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_"))

	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	var config Config
	if err := v.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}

func (c *Config) GetDSN() string {
	ds := c.GoDuck.Datasource
	sslMode := "disable"
	if ds.SSLMode != "" {
		sslMode = ds.SSLMode
	}
	return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
		ds.Host, ds.Username, ds.Password, ds.Database, ds.Port, sslMode)
}
`;

	await fs.writeFile(path.join(configDir, 'config.go'), configGo);
	console.log(chalk.gray('  Generated Go Config Loader with OTel support'));
};
