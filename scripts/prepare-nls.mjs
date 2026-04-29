import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_PATH = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT_PATH, 'locales');

if (!fs.existsSync(LOCALES_DIR)) {
    throw new Error('Missing locales directory.');
}

const nlsFiles = fs.readdirSync(LOCALES_DIR).filter(fileName => /^nls(\..+)?\.json$/i.test(fileName));
for (const fileName of nlsFiles) {
    const targetName = fileName.replace(/^nls/i, 'package.nls');
    fs.copyFileSync(path.join(LOCALES_DIR, fileName), path.join(ROOT_PATH, targetName));
}

console.log(`Prepared ${nlsFiles.length} NLS file(s).`);
