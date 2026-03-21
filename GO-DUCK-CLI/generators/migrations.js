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
    // Core Management Tables (Always present if they don't exist)
    // -------------------------------------------------------
    if (!delta) {
        const coreFileName = `00000_init_core_tables.sql`;
        const corePath = path.join(sqlDir, coreFileName);
        
        if (!await fs.pathExists(corePath)) {
            const coreSql = `-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS tenant_roles (
    id BIGSERIAL PRIMARY KEY,
    role_name VARCHAR(255) UNIQUE NOT NULL,
    db_name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
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
);

CREATE TABLE IF NOT EXISTS api_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    api_path VARCHAR(255) NOT NULL,
    usage_count BIGINT NOT NULL DEFAULT 0,
    max_limit BIGINT NOT NULL DEFAULT 1000,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS tenant_roles CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS api_usage CASCADE;
-- +goose StatementEnd
`;
            await fs.writeFile(corePath, coreSql);
        }
    }

    // -------------------------------------------------------
    // Entity Migrations
    // -------------------------------------------------------
    let sqlUp = '-- +goose Up\n-- +goose StatementBegin\n';
    let sqlDown = '-- +goose Down\n-- +goose StatementBegin\n';

    const entitiesToCreate = delta ? delta.newEntities : entities;

    if (entitiesToCreate.length === 0 && (!delta || (!delta.newFields && !delta.newRelationships))) {
        return;
    }

    // Create New Tables
    for (const entity of entitiesToCreate) {
        let columns = '    id BIGSERIAL PRIMARY KEY';

        for (const field of entity.fields) {
            let sqlType = toLiquibaseType(field, enums);
            if (sqlType === 'JSON') sqlType = 'JSONB'; // Force JSONB for Postgres
            
            const constraints = [];
            if (field.required) constraints.push('NOT NULL');
            if (field.unique) constraints.push('UNIQUE');
            
            columns += `,\n    ${field.name.toLowerCase()} ${sqlType} ${constraints.join(' ')}`;
        }

        // Auditing / Timestamp columns
        if (entity.annotation === '@Audited') {
            columns += `,\n    created_by VARCHAR(255),\n    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    last_modified_by VARCHAR(255),\n    last_modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    last_modified_user_id VARCHAR(255)`;
        } else {
            columns += `,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
        }

        sqlUp += `CREATE TABLE IF NOT EXISTS ${entity.name.toLowerCase()} (\n${columns}\n);\n\n`;
        sqlDown += `DROP TABLE IF EXISTS ${entity.name.toLowerCase()} CASCADE;\n`;
    }

    // Add New Fields
    if (delta && delta.newFields) {
        for (const [entityName, fields] of Object.entries(delta.newFields)) {
            for (const field of fields) {
                let sqlType = toLiquibaseType(field, enums);
                if (sqlType === 'JSON') sqlType = 'JSONB';
                const constraints = [];
                if (field.required) constraints.push('NOT NULL');
                if (field.unique) constraints.push('UNIQUE');

                sqlUp += `ALTER TABLE ${entityName.toLowerCase()} ADD COLUMN IF NOT EXISTS ${field.name.toLowerCase()} ${sqlType} ${constraints.join(' ')};\n`;
                sqlDown += `ALTER TABLE ${entityName.toLowerCase()} DROP COLUMN IF EXISTS ${field.name.toLowerCase()};\n`;
            }
        }
    }

    sqlUp += '-- +goose StatementEnd\n\n';
    sqlDown += '-- +goose StatementEnd\n';

    const descParts = [];
    if (!delta) {
        descParts.push('initial_schema');
    } else {
        if (delta.newEntities?.length > 0) descParts.push('create_' + delta.newEntities.map(e => e.name.toLowerCase()).join('_'));
        if (delta.newFields) descParts.push('add_fields');
    }

    const fileName = `${timestamp}_${descParts.join('_')}.sql`;
    await fs.writeFile(path.join(sqlDir, fileName), sqlUp + sqlDown);
    console.log(chalk.gray(`  Generated Goose SQL Migration: ${fileName}`));
};
