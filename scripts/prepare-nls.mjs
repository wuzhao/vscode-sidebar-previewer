import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_PATH = path.resolve(__dirname, '..');
const NLS_DIR = path.join(ROOT_PATH, 'locales', 'nls');

if (!fs.existsSync(NLS_DIR)) {
    throw new Error('Missing locales/nls directory.');
}

const nlsFiles = fs.readdirSync(NLS_DIR).filter(fileName => /^package\.nls(\..+)?\.json$/i.test(fileName));
for (const fileName of nlsFiles) {
    fs.copyFileSync(path.join(NLS_DIR, fileName), path.join(ROOT_PATH, fileName));
}

console.log(`Prepared ${nlsFiles.length} NLS file(s).`);
