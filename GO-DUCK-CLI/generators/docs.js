import fs from 'fs-extra';
import path from 'path';
import Handlebars from 'handlebars';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

export const generateDocumentation = async (config, entities, outputDir, enums = []) => {
    console.log(chalk.cyan('Generating Multi-Page Developer Guide Web App...'));

    const docsDir = path.join(outputDir, 'docs', 'web');
    await fs.ensureDir(docsDir);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const templatesDir = path.resolve(__dirname, '../templates/docs');

    if (!await fs.pathExists(templatesDir)) {
        console.log(chalk.yellow(`⚠️  Documentation templates not found at ${templatesDir}. Skipping docs generation.`));
        return;
    }

    const layoutSource = await fs.readFile(path.join(templatesDir, 'layout.hbs'), 'utf8');
    const layout = Handlebars.compile(layoutSource);

    // Register Helpers
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('toLowerCase', (str) => typeof str === 'string' ? str.toLowerCase() : '');
    Handlebars.registerHelper('capitalize', (str) => typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '');
    Handlebars.registerHelper('defaultStr', (value, safeVal) => (value !== null && value !== undefined && value !== '') ? value : safeVal);

    const pages = [
        { file: 'index', title: 'Home' },
        { file: 'gdl', title: 'GDL Reference' },
        { file: 'cli', title: 'CLI & Code Injection' },
        { file: 'rest', title: 'REST & Search API' },
        { file: 'multitenancy', title: 'Multi-Tenancy' },
        { file: 'grpc', title: 'Kratos gRPC API' },
        { file: 'graphql', title: 'GraphQL Framework' },
        { file: 'realtime', title: 'WebSockets & MQTT' },
        { file: 'audit', title: 'Audit & Metering' },
        { file: 'security', title: 'Security & Auth' },
        { file: 'observability', title: 'Observability' },
        { file: 'integrations', title: 'Client Integrations' }
    ];

    const context = {
        appName: config.name || 'GO-DUCK App',
        entities: entities,
        enums: enums
    };

    for (const page of pages) {
        const pageSource = await fs.readFile(path.join(templatesDir, 'pages', `${page.file}.hbs`), 'utf8');
        const pageTemplate = Handlebars.compile(pageSource);
        const pageHtml = pageTemplate(context);
        
        const fullHtml = layout({
            ...context,
            body: pageHtml,
            activePage: page.file,
            title: page.title
        });
        
        await fs.writeFile(path.join(docsDir, `${page.file}.html`), fullHtml);
    }

    const files = await fs.readdir(templatesDir);
    for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.mp4')) {
            await fs.copy(path.join(templatesDir, file), path.join(docsDir, file));
        }
    }

    console.log(chalk.green('✅ Multi-Page Developer Guide HTML Web App generated at: docs/web/index.html'));
};
