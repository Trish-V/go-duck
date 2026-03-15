import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { toLiquibaseType } from '../parser/gdl.js';

export const generateLiquibaseChangelogs = async (entities, relationships, projectRootDir, delta = null, enums = []) => {
    const migrationsDir = path.join(projectRootDir, 'migrations');
    const liquibaseDir = path.join(migrationsDir, 'liquibase');
    const changelogsDir = path.join(liquibaseDir, 'changelogs');
    await fs.ensureDir(migrationsDir);
    await fs.ensureDir(liquibaseDir);
    await fs.ensureDir(changelogsDir);

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const dateStamp = timestamp.substring(0, 8); // YYYYMMDD

    // -------------------------------------------------------
    // STEP 1: Build changesets FIRST — decide on filename after
    // -------------------------------------------------------
    let changeSets = '';

    const entitiesToCreate = delta ? delta.newEntities : entities;
    const relationshipsToAdd = delta ? delta.newRelationships : relationships;

    // Create New Tables
    for (const entity of entitiesToCreate) {
        let columns = `
            <column name="id" type="BIGINT" autoIncrement="true">
                <constraints primaryKey="true" nullable="false"/>
            </column>`;

        for (const field of entity.fields) {
            const liqType = toLiquibaseType(field, enums);
            const uniqueConstraint = field.unique ? ' <constraints nullable="' + (field.required ? 'false' : 'true') + '" unique="true"/>' : '';
            if (field.unique) {
                columns += `
            <column name="${field.name.toLowerCase()}" type="${liqType}">
                <constraints nullable="${field.required ? 'false' : 'true'}" unique="true"/>
            </column>`;
            } else {
                columns += `
            <column name="${field.name.toLowerCase()}" type="${liqType}">
                <constraints nullable="${field.required ? 'false' : 'true'}"/>
            </column>`;
            }
        }

        // @Audited entities get full audit columns (skip the simpler created_at/updated_at to avoid duplicates)
        if (entity.annotation === '@Audited') {
            columns += `
            <column name="created_by" type="VARCHAR(255)"/>
            <column name="created_date" type="TIMESTAMP"/>
            <column name="last_modified_by" type="VARCHAR(255)"/>
            <column name="last_modified_date" type="TIMESTAMP"/>
            <column name="last_modified_user_id" type="VARCHAR(255)"/>`;
        } else {
            columns += `
            <column name="created_at" type="TIMESTAMP"/>
            <column name="updated_at" type="TIMESTAMP"/>`;
        }

        changeSets += `
    <changeSet id="${entity.name.toLowerCase()}-create-${timestamp}" author="go-duck">
        <preConditions onFail="MARK_RAN"><not><tableExists tableName="${entity.name.toLowerCase()}"/></not></preConditions>
        <createTable tableName="${entity.name.toLowerCase()}">
            ${columns}
        </createTable>
    </changeSet>
`;
    }

    // Add New Fields to existing tables
    if (delta && delta.newFields) {
        for (const [entityName, fields] of Object.entries(delta.newFields)) {
            if (fields.length === 0) continue;
            let columnTags = '';
            for (const field of fields) {
                const liqType = toLiquibaseType(field, enums);
                if (field.unique) {
                    columnTags += `
            <column name="${field.name.toLowerCase()}" type="${liqType}">
                <constraints nullable="${field.required ? 'false' : 'true'}" unique="true"/>
            </column>`;
                } else {
                    columnTags += `
            <column name="${field.name.toLowerCase()}" type="${liqType}">
                <constraints nullable="${field.required ? 'false' : 'true'}"/>
            </column>`;
                }
            }
            changeSets += `
    <changeSet id="${entityName.toLowerCase()}-add-fields-${timestamp}" author="go-duck">
        <addColumn tableName="${entityName.toLowerCase()}">
            ${columnTags}
        </addColumn>
    </changeSet>
`;
        }
    }

    // Foreign Keys + Index
    for (const rel of relationshipsToAdd) {
        if (rel.type === 'OneToMany') {
            const childTable = rel.to.entity.toLowerCase();
            const fkNullable = rel.required ? 'false' : 'true';
            const fkCol = rel.to.field.toLowerCase() + '_id';
            const parentTable = rel.from.entity.toLowerCase();
            const fkName = `fk_${childTable}_${rel.to.field.toLowerCase()}`;
            const idxName = `idx_${childTable}_${fkCol}`;
            changeSets += `
    <changeSet id="rel-${parentTable}-${childTable}-${timestamp}" author="go-duck">
        <preConditions onFail="MARK_RAN">
            <not>
                <columnExists tableName="${childTable}" columnName="${fkCol}"/>
            </not>
        </preConditions>
        <addColumn tableName="${childTable}">
            <column name="${fkCol}" type="BIGINT">
                <constraints nullable="${fkNullable}" foreignKeyName="${fkName}" referencedTableName="${parentTable}" referencedColumnNames="id"/>
            </column>
        </addColumn>
    </changeSet>

    <changeSet id="idx-${idxName}-${timestamp}" author="go-duck">
        <preConditions onFail="MARK_RAN">
            <not><indexExists indexName="${idxName}"/></not>
        </preConditions>
        <createIndex indexName="${idxName}" tableName="${childTable}">
            <column name="${fkCol}"/>
        </createIndex>
    </changeSet>
`;
        }
    }

    // Support Tables (always on initial run, never on incremental)
    if (!delta) {
        changeSets += `
    <changeSet id="management-tables-init" author="go-duck">
        <preConditions onFail="MARK_RAN"><not><tableExists tableName="tenant_roles"/></not></preConditions>
        <createTable tableName="tenant_roles">
            <column name="id" type="BIGINT" autoIncrement="true"><constraints primaryKey="true" nullable="false"/></column>
            <column name="role_name" type="VARCHAR(255)"><constraints nullable="false" unique="true"/></column>
            <column name="db_name" type="VARCHAR(255)"><constraints nullable="false"/></column>
        </createTable>
    </changeSet>

    <changeSet id="audit-log-table-init" author="go-duck">
        <preConditions onFail="MARK_RAN"><not><tableExists tableName="audit_log"/></not></preConditions>
        <createTable tableName="audit_log">
            <column name="id" type="BIGINT" autoIncrement="true"><constraints primaryKey="true" nullable="false"/></column>
            <column name="entity_name" type="VARCHAR(255)"><constraints nullable="false"/></column>
            <column name="entity_id" type="VARCHAR(255)"><constraints nullable="false"/></column>
            <column name="action" type="VARCHAR(50)"><constraints nullable="false"/></column>
            <column name="previous_value" type="TEXT"/><column name="new_value" type="TEXT"/>
            <column name="modified_by" type="VARCHAR(255)"/><column name="keycloak_id" type="VARCHAR(255)"/>
            <column name="modified_at" type="TIMESTAMP"><constraints nullable="false"/></column>
            <column name="client_ip" type="VARCHAR(50)"/>
        </createTable>
    </changeSet>

    <changeSet id="api-usage-table-init" author="go-duck">
        <preConditions onFail="MARK_RAN"><not><tableExists tableName="api_usage"/></not></preConditions>
        <createTable tableName="api_usage">
            <column name="id" type="BIGINT" autoIncrement="true"><constraints primaryKey="true" nullable="false"/></column>
            <column name="user_id" type="VARCHAR(255)"><constraints nullable="false"/></column>
            <column name="api_path" type="VARCHAR(255)"><constraints nullable="false"/></column>
            <column name="usage_count" type="BIGINT" defaultValueNumeric="0"><constraints nullable="false"/></column>
            <column name="max_limit" type="BIGINT" defaultValueNumeric="1000"><constraints nullable="false"/></column>
            <column name="last_accessed" type="TIMESTAMP"/>
        </createTable>
    </changeSet>
`;
    }

    // -------------------------------------------------------
    // STEP 2: Only write files if there are real changesets
    // -------------------------------------------------------
    if (changeSets.trim() === '') {
        console.log(chalk.gray('  No database changes detected.'));
        return;
    }

    // Build descriptive filename from what actually changed
    const descParts = [];
    if (!delta) {
        const entityNames = entities.map(e => e.name.toLowerCase()).join('-');
        descParts.push('init');
        if (entityNames) descParts.push(entityNames);
    } else {
        if (delta.newEntities && delta.newEntities.length > 0)
            descParts.push('create-' + delta.newEntities.map(e => e.name.toLowerCase()).join('-'));
        if (delta.newFields && Object.keys(delta.newFields).length > 0)
            descParts.push('add-fields-to-' + Object.keys(delta.newFields).map(n => n.toLowerCase()).join('-'));
        if (delta.newRelationships && delta.newRelationships.length > 0)
            descParts.push('add-relations');
    }

    const changelogFileName = `changelog-${dateStamp}-${descParts.join('__')}.xml`;
    const changelogPath = path.join(changelogsDir, changelogFileName);
    const masterPath = path.join(liquibaseDir, 'master.xml');

    // Write the changelog XML
    const changelogXml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">
    ${changeSets}
</databaseChangeLog>
`;
    await fs.writeFile(changelogPath, changelogXml);

    // Register in master.xml (only now that the file exists)
    let masterXml = '';
    if (await fs.pathExists(masterPath)) {
        masterXml = await fs.readFile(masterPath, 'utf8');
        if (!masterXml.includes(changelogFileName)) {
            const includeLine = `    <include file="changelogs/${changelogFileName}" relativeToChangelogFile="true"/>`;
            masterXml = masterXml.replace('</databaseChangeLog>', `${includeLine}\n</databaseChangeLog>`);
        }
    } else {
        masterXml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <include file="changelogs/${changelogFileName}" relativeToChangelogFile="true"/>
</databaseChangeLog>
`;
    }
    await fs.writeFile(masterPath, masterXml);

    console.log(chalk.gray(`  Generated Incremental Changelog: ${changelogFileName}`));
};

const _unused = null; // toLiquibaseType imported from parser/gdl.js
