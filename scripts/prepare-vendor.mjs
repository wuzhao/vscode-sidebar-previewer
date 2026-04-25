import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// 解析仓库根目录并返回最终结果
function resolveFromRoot(relativePath) {
    return path.join(root, relativePath);
}

// 处理父目录相关逻辑并返回结果
function ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// 处理文件相关逻辑并返回结果
function copyFile(relativeSource, relativeTarget) {
    const source = resolveFromRoot(relativeSource);
    const target = resolveFromRoot(relativeTarget);

    if (!fs.existsSync(source)) {
        throw new Error(`Missing required file: ${relativeSource}`);
    }

    ensureParentDir(target);
    fs.copyFileSync(source, target);
}

// 处理目录相关逻辑并返回结果
function copyDirectory(relativeSource, relativeTarget) {
    const source = resolveFromRoot(relativeSource);
    const target = resolveFromRoot(relativeTarget);

    if (!fs.existsSync(source)) {
        throw new Error(`Missing required directory: ${relativeSource}`);
    }

    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, target, { recursive: true });
}

// 处理目录相关逻辑并返回结果
function resetDirectory(relativeTarget) {
    const target = resolveFromRoot(relativeTarget);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
}

resetDirectory('resources/vendor');

const filesToCopy = [
    ['node_modules/@vscode/codicons/dist/codicon.css', 'resources/vendor/codicons/codicon.css'],
    ['node_modules/@vscode/codicons/dist/codicon.ttf', 'resources/vendor/codicons/codicon.ttf'],
    ['node_modules/katex/dist/katex.min.css', 'resources/vendor/katex/katex.min.css'],
    ['node_modules/katex/dist/katex.min.js', 'resources/vendor/katex/katex.min.js'],
    ['node_modules/mermaid/dist/mermaid.min.js', 'resources/vendor/mermaid/mermaid.min.js']
];

for (const [source, target] of filesToCopy) {
    copyFile(source, target);
}

copyDirectory('node_modules/katex/dist/fonts', 'resources/vendor/katex/fonts');

console.log('Vendor assets prepared in resources/vendor.');
