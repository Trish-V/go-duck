import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { toLiquibaseType } from '../parser/gdl.js';

export const generateLiquibaseChangelogs = async (entities, relationships, projectRootDir, delta = null, enums = []) => {
    const migrationsDir = path.join(projectRootDir, 'migrations');
    const sqlDir = path.join(migrationsDir, 'sql');
    await fs.ensureDir(migrationsDir);
    await fs.ensureDir(sqlDir);

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];

    // -------------------------------------------------------
    // STEP 1: Build SQL Up/Down scripts
    // -------------------------------------------------------
    let sqlUp = '-- +goose Up\n-- +goose StatementBegin\n';
    let sqlDown = '\n-- +goose Down\n-- +goose StatementBegin\n';

    const entitiesToCreate = delta ? delta.newEntities : entities;

    // Create New Tables
    for (const entity of entitiesToCreate) {
        let columns = '    id BIGSERIAL PRIMARY KEY';

        for (const field of entity.fields) {
            const sqlType = toLiquibaseType(field, enums);
            const constraints = [];
            if (field.required) constraints.push('NOT NULL');
            if (field.unique) constraints.push('UNIQUE');
            
            columns += `,\n    ${field.name.toLowerCase()} ${sqlType} ${constraints.join(' ')}`;
        }

        // Auditing / Timestamp columns
        if (entity.annotation === '@Audited') {
            columns += `,\n    created_by VARCHAR(255),\n    created_date TIMESTAMP,\n    last_modified_by VARCHAR(255),\n    last_modified_date TIMESTAMP,\n    last_modified_user_id VARCHAR(255)`;
        } else {
            columns += `,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
        }

        sqlUp += `CREATE TABLE IF NOT EXISTS ${entity.name.toLowerCase()} (\n${columns}\n);\n\n`;
        sqlDown += `DROP TABLE IF EXISTS ${entity.name.toLowerCase()} CASCADE;\n`;
    }

    // Add New Fields to existing tables
    if (delta && delta.newFields) {
        for (const [entityName, fields] of Object.entries(delta.newFields)) {
            if (fields.length === 0) continue;
            for (const field of fields) {
                const sqlType = toLiquibaseType(field, enums);
                const constraints = [];
                if (field.required) constraints.push('NOT NULL');
                if (field.unique) constraints.push('UNIQUE');

                sqlUp += `ALTER TABLE ${entityName.toLowerCase()} ADD COLUMN IF NOT EXISTS ${field.name.toLowerCase()} ${sqlType} ${constraints.join(' ')};\n`;
                sqlDown += `ALTER TABLE ${entityName.toLowerCase()} DROP COLUMN IF EXISTS ${field.name.toLowerCase()};\n`;
            }
        }
    }

    // Default Tables for Auth, Multitenancy, etc.
    if (!delta) {
        // tenant_roles
        sqlUp += `CREATE TABLE IF NOT EXISTS tenant_roles (
    id BIGSERIAL PRIMARY KEY,
    role_name VARCHAR(255) UNIQUE NOT NULL,
    db_name VARCHAR(255) NOT NULL
);\n\n`;
        sqlDown += `DROP TABLE IF EXISTS tenant_roles CASCADE;\n`;

        // audit_log
        sqlUp += `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_name VARCHAR(255) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    modified_by VARCHAR(255),
    keycloak_id VARCHAR(255),
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_ip VARCHAR(50)
);\n\n`;
        sqlDown += `DROP TABLE IF EXISTS audit_log CASCADE;\n`;

        // api_usage
        sqlUp += `CREATE TABLE IF NOT EXISTS api_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    api_path VARCHAR(255) NOT NULL,
    usage_count BIGINT NOT NULL DEFAULT 0,
    max_limit BIGINT NOT NULL DEFAULT 1000,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n\n`;
        sqlDown += `DROP TABLE IF EXISTS api_usage CASCADE;\n`;
    }

    sqlUp += '-- +goose StatementEnd\n';
    sqlDown += '-- +goose StatementEnd\n';

    // -------------------------------------------------------
    // STEP 2: Write Goose SQL File
    // -------------------------------------------------------
    const descParts = [];
    if (!delta) {
        descParts.push('initial_schema');
    } else {
        if (delta.newEntities && delta.newEntities.length > 0)
            descParts.push('create_' + delta.newEntities.map(e => e.name.toLowerCase()).join('_'));
        if (delta.newFields && Object.keys(delta.newFields).length > 0)
            descParts.push('add_fields');
    }

    const fileName = `${timestamp}_${descParts.join('_')}.sql`;
    const filePath = path.join(sqlDir, fileName);

    await fs.writeFile(filePath, sqlUp + sqlDown);

    console.log(chalk.gray(`  Generated Goose SQL Migration: ${fileName}`));
};
