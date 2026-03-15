import fs from 'fs-extra';

const content = fs.readFileSync('../GDL/app.gdl', 'utf8');
const relRegex = /relationship\s+(\w+)\s*\{([^}]*)\}/g;
let match;
while ((match = relRegex.exec(content)) !== null) {
    console.log('Type:', match[1]);
    console.log('Block:', match[2]);
}
