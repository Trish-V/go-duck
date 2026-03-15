import fs from 'fs-extra';
import path from 'path';
import Handlebars from 'handlebars';
import chalk from 'chalk';

export const generateKratosCode = async (entities, projectRootDir, projectName, enums = []) => {
    console.log(chalk.cyan('Generating Kratos gRPC Services...'));

    const apiDir = path.join(projectRootDir, 'api', 'v1');
    const serviceDir = path.join(projectRootDir, 'internal', 'service');
    const serverDir = path.join(projectRootDir, 'internal', 'server');

    await fs.ensureDir(apiDir);
    await fs.ensureDir(serviceDir);
    await fs.ensureDir(serverDir);

    const protoTemplateSource = await fs.readFile(path.join(process.cwd(), 'templates', 'proto', 'entity.proto.hbs'), 'utf8');
    const protoTemplate = Handlebars.compile(protoTemplateSource);

    const serviceTemplateSource = await fs.readFile(path.join(process.cwd(), 'templates', 'kratos', 'service.go.hbs'), 'utf8');
    const serviceTemplate = Handlebars.compile(serviceTemplateSource);

    // Helpers for Proto types
    Handlebars.registerHelper('toProtoType', (type) => {
        const isEnum = enums.some(e => e.name === type);
        // Map enums to string in proto to match the Go string enums for simpler POC
        if (isEnum) return 'string';

        const map = {
            'String': 'string',
            'Integer': 'int32',
            'Long': 'int64',
            'Float': 'float',
            'BigDecimal': 'double',
            'Boolean': 'bool',
            'LocalDate': 'string',
            'Instant': 'string',
            'Text': 'string',
            'JSON': 'string',
            'JSONB': 'string'
        };
        return map[type] || 'string';
    });

    Handlebars.registerHelper('toGoCast', (type) => {
        const isEnum = enums.some(e => e.name === type);
        if (isEnum) return `models.${type}`;

        const map = {
            'Integer': 'int',
            'Long': 'int64',
            'Float': 'float64',
            'BigDecimal': 'float64',
            'Boolean': 'bool',
            'JSON': 'datatypes.JSON',
            'JSONB': 'datatypes.JSON'
        };
        return map[type] || '';
    });

    Handlebars.registerHelper('toProtoCast', (type) => {
        const isEnum = enums.some(e => e.name === type);
        if (isEnum) return 'string';

        const map = {
            'Integer': 'int32',
            'Long': 'int64',
            'Float': 'float32',
            'BigDecimal': 'double',
            'JSON': 'string',
            'JSONB': 'string'
        };
        return map[type] || '';
    });

    Handlebars.registerHelper('add', (a, b) => {
        return a + b;
    });

    Handlebars.registerHelper('hasJson', (fields) => {
        if (!fields || !Array.isArray(fields)) return false;
        return fields.some(f => f.type === 'JSON' || f.type === 'JSONB');
    });

    Handlebars.registerHelper('isJson', (type) => type === 'JSON' || type === 'JSONB');

    for (const entity of entities) {
        const context = {
            name: entity.name,
            capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1),
            lower: (s) => s.toLowerCase(),
            fields: entity.fields,
            projectName,
            enums
        };

        // 1. Generate Proto
        const protoContent = protoTemplate(context);
        await fs.writeFile(path.join(apiDir, `${entity.name.toLowerCase()}.proto`), protoContent);

        // 2. Generate Service Implementation
        const serviceContent = serviceTemplate(context);
        await fs.writeFile(path.join(serviceDir, `${entity.name.toLowerCase()}.go`), serviceContent);
    }

    // 3. Generate Auth Middleware & gRPC Server with Kratos
    await generateKratosServer(serverDir, projectName, entities);

    console.log(chalk.green('✅ Kratos gRPC code generated successfully!'));
};

const generateKratosServer = async (serverDir, projectName, entities) => {
    const grpcServerTemplate = `package server

import (
	"context"
	"github.com/go-kratos/kratos/v2/middleware/auth/jwt"
	"github.com/go-kratos/kratos/v2/middleware/recovery"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/golang-jwt/jwt/v4"
    v1 "{{projectName}}/api/v1"
    "{{projectName}}/internal/service"
    "{{projectName}}/internal/repository"
    "{{projectName}}/config"
)

func NewGRPCServer(conf *config.Config, repo *repository.Repository) *grpc.Server {
	var opts = []grpc.ServerOption{
		grpc.Middleware(
			recovery.Recovery(),
			jwt.Server(func(token *jwt.Token) (interface{}, error) {
				return []byte(conf.GoDuck.Security.KeycloakSecret), nil
			}),
		),
	}
	if conf.GoDuck.Server.GRPC.Addr != "" {
		opts = append(opts, grpc.Address(conf.GoDuck.Server.GRPC.Addr))
	}
	srv := grpc.NewServer(opts...)
    
    // Register Services
    {{#each entities}}
    v1.Register{{capitalize name}}ServiceServer(srv, service.New{{capitalize name}}Service(repo))
    {{/each}}
    // go-duck-needle-add-grpc-service

	return srv
}
`;
    const template = Handlebars.compile(grpcServerTemplate);
    const content = template({
        projectName,
        entities,
        capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1)
    });
    await fs.writeFile(path.join(serverDir, 'grpc.go'), content);
};
