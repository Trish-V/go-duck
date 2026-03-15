import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import Handlebars from 'handlebars';

export const generateGraphQLCode = async (config, entities, relationships, outputDir, enums = []) => {
    const graphDir = path.join(outputDir, 'graph');
    await fs.ensureDir(graphDir);

    const templatesDir = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '../templates/graphql');

    // 1. Generate schema.graphqls
    const schemaTemplatePath = path.join(templatesDir, 'schema.graphql.hbs');
    if (await fs.pathExists(schemaTemplatePath)) {
        const schemaTemplateSource = await fs.readFile(schemaTemplatePath, 'utf8');
        const schemaTemplate = Handlebars.compile(schemaTemplateSource);
        const schemaContent = schemaTemplate({ entities, relationships, enums });
        await fs.writeFile(path.join(graphDir, 'schema.graphqls'), schemaContent);
        console.log(chalk.gray('  Generated GraphQL Schema: schema.graphqls'));
    }

    // 2. Generate resolver.go
    const resolverTemplatePath = path.join(templatesDir, 'resolver.go.hbs');
    if (await fs.pathExists(resolverTemplatePath)) {
        const resolverTemplateSource = await fs.readFile(resolverTemplatePath, 'utf8');
        const resolverTemplate = Handlebars.compile(resolverTemplateSource);
        const resolverContent = resolverTemplate({
            app_name: config.name,
            entities,
            relationships,
            enums
        });
        await fs.writeFile(path.join(graphDir, 'resolver.go'), resolverContent);
        console.log(chalk.gray('  Generated GraphQL Resolvers: resolver.go'));
    }

    console.log(chalk.green('✅ GraphQL code generated successfully!'));
};
