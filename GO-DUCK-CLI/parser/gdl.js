import fs from 'fs-extra';
import path from 'path';

/**
 * GO-DUCK GDL Parser
 *
 * Supported field syntax:
 *   fieldName  Type  [required]  [unique]  [text]
 *
 * Supported types:
 *   String, Text, Integer, Long, Float, BigDecimal, Boolean, LocalDate, Instant, JSON, JSONB
 *
 * Type overrides in GDL:
 *   - `Text` maps to TEXT in DB and string in Go
 *   - `String(512)` maps to VARCHAR(512) in DB
 *
 * Examples:
 *   email    String  required  unique
 *   bio      Text
 *   name     String  required
 */

export const parseGDL = async (filePath) => {
    const rawContent = await fs.readFile(filePath, 'utf8');
    // Strip single-line (//) and multi-line (/* */) comments to prevent parsing artifacts
    const content = rawContent.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    
    const entities = [];
    const relationships = [];
    const enums = [];

    // Parse enum blocks
    const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let match;
    while ((match = enumRegex.exec(content)) !== null) {
        const name = match[1];
        const values = match[2].split(',').map(v => v.trim().replace(/['"]/g, '')).filter(v => v.length > 0);
        enums.push({ name, values });
    }

    // Parse entity blocks
    const entityRegex = /(@\w+\s+)?entity\s+(\w+)\s*\{([\s\S]*?)\}/g;
    while ((match = entityRegex.exec(content)) !== null) {
        const annotation = match[1]?.trim();
        const name = match[2];
        const fieldBlock = match[3];

        if (name === 'relationship' || name === 'enum') continue;

        const fields = [];
        const fieldLines = fieldBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of fieldLines) {
            const parts = line.split(/\s+/);
            if (parts.length < 2) continue;

            const fieldName = parts[0];
            let rawType = parts[1];

            // Support String(N) for custom VARCHAR sizes
            let varcharSize = 255;
            const sizeMatch = rawType.match(/^String\((\d+)\)$/);
            if (sizeMatch) {
                varcharSize = parseInt(sizeMatch[1], 10);
                rawType = 'String';
            }

            const required = line.includes('required');
            const unique = line.includes('unique');
            const isText = rawType === 'Text';

            // Check if type is an Enum
            const isEnum = enums.some(e => e.name === rawType);

            fields.push({
                name: fieldName,
                type: isText ? 'Text' : rawType,
                required,
                unique,
                isEnum,
                varcharSize: rawType === 'String' ? varcharSize : null,
            });
        }

        entities.push({ name, annotation, fields });
    }

    // Parse relationship blocks
    const relRegex = /relationship\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    while ((match = relRegex.exec(content)) !== null) {
        const type = match[1];
        const relBlock = match[2];
        const relLines = relBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of relLines) {
            const relParts = line.split(/\s+to\s+/);
            if (relParts.length !== 2) continue;

            const parseRelPart = (p) => {
                const m = p.match(/(\w+)\s*\{\s*(\w+)\s*\}/);
                return m ? { entity: m[1], field: m[2] } : null;
            };

            // Support required FK: "required" keyword anywhere in the line
            const fkRequired = line.includes('required');

            const from = parseRelPart(relParts[0]);
            const to = parseRelPart(relParts[1]);

            if (from && to) {
                relationships.push({ type, from, to, required: fkRequired });
            }
        }
    }

    // Parse open entities
    const openEntities = [];
    const openRegex = /open\s+(.*)/g;
    while ((match = openRegex.exec(content)) !== null) {
        const val = match[1].trim();
        // Split by comma but ignore commas inside parentheses
        const items = val.split(/,(?![^\(]*\))/).map(v => v.trim()).filter(v => v.length > 0);
        
        for (const item of items) {
             const itemMatch = item.match(/^([\w\*]+)(?:\s*\((.*?)\))?$/);
             if (itemMatch) {
                 const name = itemMatch[1];
                 const actionStr = itemMatch[2];
                 let actions = ['read', 'create', 'update', 'delete'];
                 if (actionStr) {
                     actions = actionStr.split(/[\s,]+/).map(a => a.trim().toLowerCase()).filter(a => a.length > 0);
                 }
                 
                 openEntities.push({ name, actions });
             }
        }
    }

    return { entities, relationships, enums, openEntities };
};

/**
 * Maps GDL type to Go type
 */
export const toGoType = (type, enums = []) => {
    const isEnum = enums.some(e => e.name === type);
    if (isEnum) return type;

    const map = {
        String: 'string',
        Text: 'string',
        Integer: 'int',
        Long: 'int64',
        Float: 'float64',
        BigDecimal: 'float64',
        Boolean: 'bool',
        LocalDate: 'time.Time',
        Instant: 'time.Time',
        JSON: 'datatypes.JSON',
        JSONB: 'datatypes.JSON',
    };
    return map[type] || 'interface{}';
};

/**
 * Maps GDL type to Liquibase/SQL type
 */
export const toLiquibaseType = (field, enums = []) => {
    if (field.type === 'Text') return 'TEXT';
    if (field.type === 'String' && field.varcharSize) return `VARCHAR(${field.varcharSize})`;
    
    // Enums are stored as VARCHAR with a check constraint or just as strings
    if (field.isEnum) return 'VARCHAR(50)';

    const map = {
        String: 'VARCHAR(255)',
        Integer: 'INT',
        Long: 'BIGINT',
        Float: 'DECIMAL',
        BigDecimal: 'DECIMAL',
        Boolean: 'BOOLEAN',
        LocalDate: 'DATE',
        Instant: 'TIMESTAMP',
        JSON: 'JSON',
        JSONB: 'JSONB',
    };
    return map[field.type] || 'VARCHAR(255)';
};
