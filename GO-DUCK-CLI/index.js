#!/usr/bin/env node

/**
 * GO-DUCK-CLI: A powerful Go code generator for microservices.
 * Supports full project creation and incremental GDL imports.
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import chalk from 'chalk';
import { parseGDL } from './parser/gdl.js';
import { generateMultitenancy } from './generators/multitenancy.js';
import { generateLiquibaseChangelogs } from './generators/migrations.js';
import { generateMeteringCode } from './generators/metering.js';
import { generateGraphQLCode } from './generators/graphql.js';
import { generatePostgRESTCode } from './generators/postgrest.js';
import { generateSwaggerDocs } from './generators/swagger.js';
import { generateSecurityMiddleware } from './generators/security.js';
import { generateWebSocketCode } from './generators/websocket.js';
import { generateConfigLoader } from './generators/config.js';
import { generateLoggerCode } from './generators/logger.js';
import { generateMQTTCode } from './generators/mqtt.js';
import { generateCacheCode } from './generators/cache.js';
import { generateResilienceCode } from './generators/resilience.js';
import { generateTelemetryCode } from './generators/telemetry.js';
import { generateDeploymentArtifacts } from './generators/devops.js';
import { generateKratosCode } from './generators/kratos.js';
import { generateRepositoryCode } from './generators/repository.js';
import { generateDocumentation } from './generators/docs.js';

export const generateAuditCode = async (config, outputDir) => {
    const middlewareDir = path.join(outputDir, 'middleware');
    const modelsDir = path.join(outputDir, 'models');
    const controllersDir = path.join(outputDir, 'controllers');

    await fs.ensureDir(middlewareDir);
    await fs.ensureDir(modelsDir);
    await fs.ensureDir(controllersDir);

    const auditModel = `
package models

import (
    "time"
)

type AuditLog struct {
    ID             uint      \`gorm:"primaryKey" json:"id"\`
    EntityName     string    \`json:"entityName"\`
    EntityID       string    \`json:"entityId"\`
    Action         string    \`json:"action"\` // CREATE, UPDATE, DELETE
    PreviousValue  string    \`json:"previousValue" gorm:"type:text"\`
    NewValue       string    \`json:"newValue" gorm:"type:text"\`
    ModifiedBy     string    \`json:"modifiedBy"\`
    KeycloakID     string    \`json:"keycloakId"\`
    ModifiedAt     time.Time \`json:"modifiedAt"\`
    ClientIP       string    \`json:"clientIp"\`
}
`;

    const auditMiddleware = `
package middleware

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"{{app_name}}/models"
)

func AuditMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet {
			c.Next()
			return
		}

		// Simplified auditing logic
		method := c.Request.Method
		path := c.Request.URL.Path
		
		// Map method to action
		action := "UPDATE"
		if method == http.MethodPost { action = "CREATE" }
		if method == http.MethodDelete { action = "DELETE" }

		// Mock user and IP
		userEmail := c.GetHeader("User-Email")
		if userEmail == "" { userEmail = "anonymous" }
		
		keycloakId := c.GetHeader("X-Keycloak-Id")
		clientIP := c.ClientIP()

		// Call next handlers
		c.Next()

		// Logic to capture entity ID and snapshot values would go here...
		// For now, track the action
		auditEntry := models.AuditLog{
			EntityName: path,
			Action:     action,
			ModifiedBy: userEmail,
			KeycloakID: keycloakId,
			ModifiedAt: time.Now(),
			ClientIP:   clientIP,
		}
		db.Create(&auditEntry)
	}
}
`;

    const auditController = `
package controllers

import (
	"net/http"
	"{{app_name}}/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AuditController struct {
	DB *gorm.DB
}

func (ac *AuditController) GetLogs(c *gin.Context) {
	var logs []models.AuditLog
	ac.DB.Order("modified_at desc").Find(&logs)
	c.JSON(http.StatusOK, logs)
}
`;

    await fs.writeFile(path.join(modelsDir, 'audit_log.go'), auditModel);
    await fs.writeFile(path.join(middlewareDir, 'audit_middleware.go'), auditMiddleware.replace('{{app_name}}', config.name));
    await fs.writeFile(path.join(controllersDir, 'audit_controller.go'), auditController.replace('{{app_name}}', config.name));
};

const program = new Command();

// Handlebars Helpers
Handlebars.registerHelper('capitalize', (str) => {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('hasJson', (fields) => {
    if (!fields || !Array.isArray(fields)) return false;
    return fields.some(f => f.type === 'JSON' || f.type === 'JSONB');
});

Handlebars.registerHelper('isJson', (type) => type === 'JSON' || type === 'JSONB');

Handlebars.registerHelper('toLowerCase', (str) => {
    if (typeof str !== 'string') return '';
    return str.toLowerCase();
});

Handlebars.registerHelper('toGoType', (type, options) => {
    const enums = options.data.root.enums || [];
    const isEnum = enums.some(e => e.name === type);
    if (isEnum) return type;

    const types = {
        'String': 'string',
        'Text': 'string',
        'Integer': 'int',
        'Float': 'float64',
        'Boolean': 'bool',
        'Long': 'int64',
        'BigDecimal': 'float64',
        'LocalDate': 'time.Time',
        'Instant': 'time.Time',
        'JSON': 'datatypes.JSON',
        'JSONB': 'datatypes.JSON'
    };
    return types[type] || 'interface{}';
});

Handlebars.registerHelper('gql_type', (type, options) => {
    const enums = options.data.root.enums || [];
    const isEnum = enums.some(e => e.name === type);
    if (isEnum) return type;

    const types = {
        'String': 'String',
        'Integer': 'Int',
        'Float': 'Float',
        'Boolean': 'Boolean',
        'Long': 'ID',
        'BigDecimal': 'Float',
        'LocalDate': 'String',
        'Instant': 'String',
        'JSON': 'String',
        'JSONB': 'String'
    };
    return types[type] || 'String';
});

Handlebars.registerHelper('eq', (a, b) => a === b);

program
    .name('go-duck-cli')
    .description('A powerful Go code generator for microservices')
    .version('1.0.0');

// Helper to load configuration
const loadConfig = async (configPath) => {
    try {
        const fileContents = await fs.readFile(configPath, 'utf8');
        const config = yaml.load(fileContents);
        const appConfig = config.app || {};
        return appConfig;
    } catch (error) {
        console.error(chalk.red(`Error loading config from ${configPath}:`), error.message);
        process.exit(1);
    }
};

const saveEntitySnapshot = async (outputDir, entity) => {
    const goDuckDir = path.join(outputDir, '.go-duck');
    await fs.ensureDir(goDuckDir);
    await fs.writeJson(path.join(goDuckDir, `${entity.name.toLowerCase()}.json`), entity, { spaces: 2 });
};

const getPreviousEntities = async (outputDir) => {
    const goDuckDir = path.join(outputDir, '.go-duck');
    if (!await fs.pathExists(goDuckDir)) return [];

    const files = await fs.readdir(goDuckDir);
    const entities = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            const content = await fs.readJson(path.join(goDuckDir, file));
            entities.push(content);
        }
    }
    return entities;
};

const generateEntities = async (gdlFilePath, outputDir, config) => {
    if (!await fs.pathExists(gdlFilePath)) {
        console.error(chalk.red(`❌ GDL file not found: ${gdlFilePath}`));
        return null;
    }

    const { entities, relationships, enums } = await parseGDL(gdlFilePath);
    console.log(chalk.green(`✅ Parsed ${entities.length} entities, ${relationships.length} relationships, and ${enums.length} enums`));

    const previousEntities = await getPreviousEntities(outputDir);
    const delta = {
        newEntities: [],
        newFields: {},
        newRelationships: []
    };

    // Calculate Delta for Incremental Migrations
    for (const entity of entities) {
        const prev = previousEntities.find(e => e.name === entity.name);
        if (!prev) {
            delta.newEntities.push(entity);
        } else {
            // Check for new fields
            const newFields = entity.fields.filter(f => !prev.fields.some(pf => pf.name === f.name));
            if (newFields.length > 0) {
                delta.newFields[entity.name] = newFields;
            }
        }
    }

    // New relationships
    delta.newRelationships = relationships.filter(rel => {
        const fromEntityCreated = delta.newEntities.some(e => e.name === rel.from.entity);
        const toEntityCreated = delta.newEntities.some(e => e.name === rel.to.entity);
        return fromEntityCreated || toEntityCreated;
    });

    const entityTemplatePath = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'templates/go/entity.go.hbs');
    const entityTemplateSource = await fs.readFile(entityTemplatePath, 'utf8');
    const entityTemplate = Handlebars.compile(entityTemplateSource);

    const controllerTemplatePath = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'templates/go/controller.go.hbs');
    const controllerTemplateSource = await fs.readFile(controllerTemplatePath, 'utf8');
    const controllerTemplate = Handlebars.compile(controllerTemplateSource);

    const enumTemplatePath = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'templates/go/enum.go.hbs');
    const enumTemplateSource = await fs.readFile(enumTemplatePath, 'utf8');
    const enumTemplate = Handlebars.compile(enumTemplateSource);

    await fs.ensureDir(path.join(outputDir, 'models'));
    await fs.ensureDir(path.join(outputDir, 'controllers'));

    // Generate Enums
    if (enums.length > 0) {
        let enumContent = 'package models\n\n';
        for (const en of enums) {
            enumContent += enumTemplate(en).trim() + '\n\n';
        }
        await fs.writeFile(path.join(outputDir, 'models', 'enums.go'), enumContent);
        console.log(chalk.gray(`   - Generated Enums: models/enums.go`));
    }

    for (const entity of entities) {
        entity.relationships = relationships.filter(r => r.from.entity === entity.name || r.to.entity === entity.name);
        entity.app_name = config.name;
        entity.enums = enums; // Pass enums context for helpers

        // Generate Model
        const entityContent = entityTemplate(entity);
        await fs.writeFile(path.join(outputDir, 'models', `${entity.name.toLowerCase()}.go`), entityContent);

        // Generate Controller
        const controllerContent = controllerTemplate(entity);
        await fs.writeFile(path.join(outputDir, 'controllers', `${entity.name.toLowerCase()}_controller.go`), controllerContent);

        console.log(chalk.gray(`   - Updated Entity & Controller: ${entity.name}`));

        // Save Snapshot for next comparison
        await saveEntitySnapshot(outputDir, entity);
    }

    // Generate Incremental Changelogs!
    await generateLiquibaseChangelogs(entities, relationships, outputDir, delta, enums);
    console.log(chalk.green('✅ Liquibase incremental migrations updated!'));

    return { entities, relationships, enums };
};

program
    .command('create')
    .description('Create a new base Go app from config.yaml and GDL')
    .option('-c, --config <path>', 'Path to config.yaml', '../CONFIG/config.yaml')
    .option('-o, --output <path>', 'Path to generate project', '.')
    .option('-g, --gdl <path>', 'Path to GDL files directory', '../GDL')
    .action(async (options) => {
        const { config: configPath, output: outputDir, gdl: gdlDir } = options;
        console.log(chalk.blue('🚀 Starting Go-Duck project generation...'));

        const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
        await fs.ensureDir(absoluteOutputDir);

        const config = await loadConfig(path.resolve(process.cwd(), configPath));
        console.log(chalk.green(`✅ Config loaded for app: ${config.name}`));

        await generateConfigLoader(absoluteOutputDir);
        await generateLoggerCode(config, absoluteOutputDir);
        await generateMQTTCode(config, absoluteOutputDir);
        await generateCacheCode(config, absoluteOutputDir);
        await generateResilienceCode(config, absoluteOutputDir);
        await generateTelemetryCode(config, absoluteOutputDir);
        await generateDeploymentArtifacts(config, absoluteOutputDir);
        await generateYAMLConfigs(config, absoluteOutputDir);
        const { entities, relationships, enums } = await generateEntities(path.join(path.resolve(process.cwd(), gdlDir), 'app.gdl'), absoluteOutputDir, config);
        await generateKratosCode(entities, absoluteOutputDir, config.name, enums);

        await generateRepositoryCode(absoluteOutputDir);

        await generateGraphQLCode(config, entities, relationships, absoluteOutputDir, enums);
        if (config.multitenancy?.enabled) await generateMultitenancy(config, absoluteOutputDir);
        await generateAuditCode(config, absoluteOutputDir);
        await generateMeteringCode(config, absoluteOutputDir);
        await generateSecurityMiddleware(config, absoluteOutputDir);
        await generateWebSocketCode(config, entities, absoluteOutputDir);
        await generatePostgRESTCode(config, absoluteOutputDir);
        console.log(chalk.green('✅ PostgREST-like search layer created!'));

        // 8. Generate Swagger Docs
        await generateSwaggerDocs(config, entities, absoluteOutputDir);
        console.log(chalk.green('✅ Swagger API documentation generated!'));

        // 8.5 Generate Web Docs App
        await generateDocumentation(config, entities, absoluteOutputDir, enums);
        console.log(chalk.green('✅ Web Documentation App generated!'));

        // 9. Generate main.go
        const mainTemplatePath = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'templates/go/main.go.hbs');
        if (await fs.pathExists(mainTemplatePath)) {
            const mainTemplateSource = await fs.readFile(mainTemplatePath, 'utf8');
            const mainTemplate = Handlebars.compile(mainTemplateSource);
            await fs.writeFile(path.join(absoluteOutputDir, 'main.go'), mainTemplate({ app_name: config.name, entities }));
            console.log(chalk.green('✅ main.go entry point created!'));
        }
        console.log(chalk.bold.magenta('\n✨ Project created successfully!'));
    });

program
    .command('import-gdl <file>')
    .description('Import entities from a GDL file into an existing app')
    .option('-o, --output <path>', 'Path to the existing app root', '.')
    .action(async (file, options) => {
        const absoluteOutputDir = path.resolve(process.cwd(), options.output);
        console.log(chalk.blue(`📥 Importing GDL from ${file}...`));

        const config = await loadConfig(path.resolve(process.cwd(), '../CONFIG/config.yaml'));
        await generateConfigLoader(absoluteOutputDir);
        await generateLoggerCode(config, absoluteOutputDir);
        await generateMQTTCode(config, absoluteOutputDir);
        await generateCacheCode(config, absoluteOutputDir);
        await generateResilienceCode(config, absoluteOutputDir);
        await generateTelemetryCode(config, absoluteOutputDir);
        await generateDeploymentArtifacts(config, absoluteOutputDir);
        const { entities, relationships, enums } = await generateEntities(path.resolve(process.cwd(), file), absoluteOutputDir, config);
        await generateKratosCode(entities, absoluteOutputDir, config.name, enums);

        await generateRepositoryCode(absoluteOutputDir);

        await generateGraphQLCode(config, entities, relationships, absoluteOutputDir, enums);
        // Sync PostgREST search as well
        await generatePostgRESTCode(config, absoluteOutputDir);

        // Sync Security
        await generateSecurityMiddleware(config, absoluteOutputDir);

        // Sync WebSocket
        await generateWebSocketCode(config, entities, absoluteOutputDir);

        // Sync Swagger Docs
        await generateSwaggerDocs(config, entities, absoluteOutputDir);

        // Sync Web Docs App
        await generateDocumentation(config, entities, absoluteOutputDir, enums);

        // Regenerate main.go to include new routes if any (or just entities)
        const mainTemplatePath = path.resolve(path.dirname(import.meta.url.replace('file://', '')), 'templates/go/main.go.hbs');
        if (await fs.pathExists(mainTemplatePath)) {
            const mainTemplate = Handlebars.compile(await fs.readFile(mainTemplatePath, 'utf8'));
            await fs.writeFile(path.join(absoluteOutputDir, 'main.go'), mainTemplate({ app_name: config.name, entities }));
            console.log(chalk.green('✅ Updated main.go to register new entity routes.'));
        }
        console.log(chalk.bold.magenta('\n✨ GDL Import Completed with Incremental Migrations! ✨'));
    });

const generateYAMLConfigs = async (config, outputDir) => {
    // Clean up input config - remove the static multitenancy-databases list if it exists
    const cleanConfig = { ...config };
    if (cleanConfig.datasource && cleanConfig.datasource['multitenancy-databases']) {
        delete cleanConfig.datasource['multitenancy-databases'];
    }

    const extendedConfig = {
        ...cleanConfig,
        server: {
            port: 8080,
            'read-timeout': '30s',
            'write-timeout': '30s',
            grpc: {
                addr: ':9000',
                network: 'tcp',
                timeout: '1s'
            },
            cors: {
                'allow-origins': ['*'],
                'allow-methods': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                'allow-headers': ['Origin', 'Content-Type', 'Accept', 'Authorization']
            }
        },
        datasource: {
            ...cleanConfig.datasource,
            'max-open-conns': 25,
            'max-idle-conns': 10,
            'conn-max-lifetime': '5m'
        },
        security: {
            ...cleanConfig.security,
            'rate-limit': {
                rps: 100,
                burst: 200
            }
        },
        logging: {
            datadog: {
                enabled: false,
                'api-key': 'YOUR_DATADOG_API_KEY',
                site: 'datadoghq.com',
                service: cleanConfig.name || 'go-duck-service'
            }
        },
        messaging: {
            mqtt: {
                enabled: false,
                broker: 'tcp://localhost:1883',
                'client-id': (cleanConfig.name || 'go-duck') + '-dev',
                username: 'dev_user',
                password: 'dev_password',
                'topic-prefix': 'go-duck/events'
            }
        },
        cache: {
            redis: {
                enabled: false,
                host: 'localhost:6379',
                password: '',
                db: 0,
                ttl: '10m'
            }
        },
        resilience: {
            'circuit-breaker': {
                enabled: true,
                'failure-threshold': 5,
                'success-threshold': 2,
                timeout: '60s'
            }
        },
        telemetry: {
            otel: {
                enabled: false,
                endpoint: 'localhost:4317',
                'sampler-ratio': 1.0
            }
        }
    };

    const baseConfig = { 'go-duck': extendedConfig };
    await fs.writeFile(path.join(outputDir, 'application.yml'), yaml.dump(baseConfig));

    const devConfig = {
        'go-duck': extendedConfig,
        environment: { active_profile: 'dev' }
    };
    await fs.writeFile(path.join(outputDir, 'application-dev.yml'), yaml.dump(devConfig));

    const prodConfig = {
        'go-duck': {
            ...extendedConfig,
            server: {
                ...extendedConfig.server,
                cors: {
                    ...extendedConfig.server.cors,
                    'allow-origins': ['https://your-domain.com']
                }
            },
            logging: {
                ...extendedConfig.logging,
                datadog: {
                    ...extendedConfig.logging.datadog,
                    enabled: true
                }
            },
            messaging: {
                mqtt: {
                    enabled: true,
                    broker: 'tcp://mqtt.production.svc:1883',
                    'client-id': cleanConfig.name + '-prod',
                    username: 'prod_user',
                    password: 'prod_password',
                    'topic-prefix': 'go-duck/events'
                }
            },
            cache: {
                redis: {
                    enabled: true,
                    host: 'redis.production.svc:6379',
                    password: 'prod_redis_password',
                    db: 0,
                    ttl: '1h'
                }
            },
            resilience: {
                'circuit-breaker': {
                    enabled: true,
                    'failure-threshold': 3,
                    'success-threshold': 5,
                    timeout: '30s'
                }
            },
            telemetry: {
                otel: {
                    enabled: true,
                    endpoint: 'otel-collector.monitoring.svc:4317',
                    'sampler-ratio': 0.1
                }
            },
            datasource: {
                ...extendedConfig.datasource,
                'max-open-conns': 100,
                'max-idle-conns': 50
            }
        },
        environment: { active_profile: 'prod' }
    };
    await fs.writeFile(path.join(outputDir, 'application-prod.yml'), yaml.dump(prodConfig));
};

program.parse(process.argv);
