import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateSwaggerDocs = async (config, entities, outputDir) => {
    const docsDir = path.join(outputDir, 'docs');
    await fs.ensureDir(docsDir);

    const swagger = {
        openapi: '3.0.0',
        info: {
            title: `${config.name} API`,
            version: '1.0.0',
            description: `Generated documentation for ${config.name} microservice`
        },
        servers: [
            { url: 'http://localhost:8080/api', description: 'Local Development Server' }
        ],
        paths: {},
        components: {
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        }
    };

    // 1. Add Entity Paths
    for (const entity of entities) {
        const name = entity.name.toLowerCase();
        const capitalized = entity.name;

        // Add Schema for Entity
        swagger.components.schemas[capitalized] = {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                ...entity.fields.reduce((acc, field) => {
                    acc[field.name] = { type: mapToSwaggerType(field.type) };
                    return acc;
                }, {}),
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
            }
        };

        // POST /entities
        swagger.paths[`/${name}s`] = {
            post: {
                tags: [capitalized],
                summary: `Create a new ${capitalized}`,
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } }
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } }
                }
            },
            get: {
                tags: [capitalized],
                summary: `Get all ${capitalized}s`,
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer' } },
                    { name: 'size', in: 'query', schema: { type: 'integer' } },
                    { name: 'eager', in: 'query', schema: { type: 'boolean' } }
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${capitalized}` } } } } }
                }
            }
        };

        // GET/PUT/PATCH/DELETE /entities/:id
        swagger.paths[`/${name}s/{id}`] = {
            get: {
                tags: [capitalized],
                summary: `Get ${capitalized} by ID`,
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } }
                }
            },
            put: {
                tags: [capitalized],
                summary: `Update ${capitalized}`,
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    200: { description: 'Updated', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } }
                }
            },
            delete: {
                tags: [capitalized],
                summary: `Delete ${capitalized}`,
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: {
                    204: { description: 'No Content' }
                }
            }
        };
    }

    // 2. Add System Paths
    swagger.paths['/rpc/{table}'] = {
        get: {
            tags: ['Search'],
            summary: 'Generic PostgREST-like Search',
            parameters: [
                { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'order', in: 'query', schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
            ],
            responses: { 200: { description: 'OK' } }
        }
    };

    swagger.paths['/audit'] = {
        get: {
            tags: ['Audit'],
            summary: 'View Audit Logs',
            responses: { 200: { description: 'OK' } }
        }
    };

    await fs.writeJson(path.join(docsDir, 'swagger.json'), swagger, { spaces: 2 });
    console.log(chalk.gray('  Generated Swagger Documentation: swagger.json'));
};

const mapToSwaggerType = (type) => {
    const types = {
        'String': 'string',
        'Integer': 'integer',
        'Float': 'number',
        'Boolean': 'boolean',
        'Long': 'integer',
        'BigDecimal': 'number',
        'LocalDate': 'string',
        'Instant': 'string'
    };
    return types[type] || 'string';
};
