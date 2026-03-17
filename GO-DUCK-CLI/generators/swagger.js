import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateSwaggerDocs = async (config, entities, outputDir, openEntities = []) => {
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
            { url: 'http://localhost:8080', description: 'Local Development Server' }
        ],
        paths: {},
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                },
                TenantID: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-Tenant-ID',
                    description: 'The unique identifier for the tenant context'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        // Global security applies to /api by default in our implementation, 
        // but Swagger paths can override this.
        security: [
            { BearerAuth: [], TenantID: [] }
        ]
    };

    const commonHeaders = [
        { name: 'X-Tenant-ID', in: 'header', required: true, schema: { type: 'string', default: 'default' }, description: 'Multi-tenancy context identifier' }
    ];

    const isOpen = (entityName, action) => {
        if (!openEntities || !Array.isArray(openEntities)) return false;
        
        // Check wildcard first
        const wildcard = openEntities.find(e => e.name === '*');
        if (wildcard) {
            if (!action) return true;
            if (wildcard.actions.includes(action.toLowerCase())) return true;
        }

        const entry = openEntities.find(e => e.name.toLowerCase() === entityName.toLowerCase());
        if (entry) {
            if (!action) return true;
            if (entry.actions.includes(action.toLowerCase())) return true;
        }

        return false;
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

        const addEntityOperations = (basePath, isPublic) => {
            const security = isPublic ? [{ TenantID: [] }] : undefined; // undefined uses global security

            // Unified helper for path registration based on permissions
            const regPath = (path, method, op, action) => {
                if (isPublic && !isOpen(capitalized, action)) return;
                
                if (!swagger.paths[path]) swagger.paths[path] = {};
                swagger.paths[path][method] = {
                    ...op,
                    tags: [isPublic ? `${capitalized} (Public)` : capitalized],
                    summary: `${op.summary} ${isPublic ? '(Public)' : ''}`,
                    security: security
                };
            };

            // CRUD Operations
            regPath(`${basePath}/${name}s`, 'post', {
                summary: `Create a new ${capitalized}`,
                parameters: [...commonHeaders],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } }
                },
                responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } } }
            }, 'create');

            regPath(`${basePath}/${name}s`, 'get', {
                summary: `Get all ${capitalized}s`,
                parameters: [
                    ...commonHeaders,
                    { name: 'page', in: 'query', schema: { type: 'integer' }, description: 'Zero-based page index' },
                    { name: 'size', in: 'query', schema: { type: 'integer' }, description: 'Records per page' },
                    { name: 'eager', in: 'query', schema: { type: 'boolean' }, description: 'If true, performs SQL Join to fetch relations' }
                ],
                responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${capitalized}` } } } } } }
            }, 'read');

            regPath(`${basePath}/${name}s/{id}`, 'get', {
                summary: `Get ${capitalized} by ID`,
                parameters: [
                    ...commonHeaders,
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'eager', in: 'query', schema: { type: 'boolean' } }
                ],
                responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } } }
            }, 'read');

            regPath(`${basePath}/${name}s/{id}`, 'put', {
                summary: `Update ${capitalized}`,
                parameters: [...commonHeaders, { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated', content: { 'application/json': { schema: { $ref: `#/components/schemas/${capitalized}` } } } } }
            }, 'update');

            regPath(`${basePath}/${name}s/{id}`, 'patch', {
                summary: `Patch ${capitalized}`,
                parameters: [...commonHeaders, { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Patched' } }
            }, 'update');

            regPath(`${basePath}/${name}s/{id}`, 'delete', {
                summary: `Delete ${capitalized}`,
                parameters: [...commonHeaders, { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 204: { description: 'No Content' } }
            }, 'delete');

            // Bulk Operations
            regPath(`${basePath}/${name}s/bulk`, 'post', {
                summary: `Bulk Create ${capitalized}s`,
                parameters: [...commonHeaders],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${capitalized}` } } } }
                },
                responses: { 201: { description: 'Created' } }
            }, 'create');

            regPath(`${basePath}/${name}s/bulk`, 'put', {
                summary: `Bulk Update ${capitalized}s`,
                parameters: [...commonHeaders],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${capitalized}` } } } }
                },
                responses: { 200: { description: 'Updated' } }
            }, 'update');

            regPath(`${basePath}/${name}s/bulk`, 'patch', {
                summary: `Bulk Patch ${capitalized}s`,
                parameters: [...commonHeaders],
                requestBody: {
                    required: true,
                    content: { 
                        'application/json': { 
                            schema: { 
                                type: 'array', 
                                items: { 
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        changes: { type: 'object' }
                                    }
                                } 
                            } 
                        }
                    }
                },
                responses: { 200: { description: 'Patched' } }
            }, 'update');
        };

        // 1a. Secured Paths
        addEntityOperations('/api', false);

        // 1b. Public Paths (if marked as open)
        addEntityOperations('/open/api', true);
    }

    // 2. Add System Paths
    swagger.paths['/rpc/{table}'] = {
        get: {
            tags: ['Search Engine'],
            summary: 'Generic PostgREST RPC Engine',
            description: `Powerful dynamic querying system. 
            
            ### Dynamic Filtering
            Append any column name as a query parameter using operator notation:
            - \`?age=gt.20\` (Greater Than)
            - \`?name=ilike.John\` (Case-insensitive search)
            - \`?id=in.1,2,3\` (Set containment)
            
            ### JSONB Path Querying
            For JSON fields, use arrow notation:
            - \`?metadata->>role=eq.ADMIN\` (Nested text extraction)
            - \`?details->count=gt.5\` (Nested numeric extraction)`,
            parameters: [
                ...commonHeaders,
                { name: 'table', in: 'path', required: true, schema: { type: 'string' }, description: 'The database table to query' },
                { name: 'order', in: 'query', schema: { type: 'string' }, description: 'Sorting (e.g., id.desc)' },
                { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Row limit' },
                { name: 'offset', in: 'query', schema: { type: 'integer' }, description: 'Query offset' }
            ],
            responses: { 
                200: { 
                    description: 'OK', 
                    content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } 
                } 
            }
        }
    };

    swagger.paths['/audit'] = {
        get: {
            tags: ['Observability'],
            summary: 'Fetch Audit Trail',
            parameters: [...commonHeaders],
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
        'Instant': 'string',
        'JSON': 'object',
        'JSONB': 'object',
        'Text': 'string'
    };
    return types[type] || 'string';
};
