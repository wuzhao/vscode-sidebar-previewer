import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 仓库根目录绝对路径，供资源复制流程复用
const ROOT_PATH = path.resolve(__dirname, '..');

/**
 * 解析仓库根目录并返回最终结果
 * @param relativePath - 仓库内相对路径
 * @returns 返回仓库内目标资源的绝对路径
 */
function resolveFromRoot(relativePath) {
    return path.join(ROOT_PATH, relativePath);
}

/**
 * 处理父目录相关逻辑并返回结果
 * @param filePath - 目标文件绝对路径
 */
function ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * 处理文件相关逻辑并返回结果
 * @param relativeSource - 源资源相对路径
 * @param relativeTarget - 目标资源相对路径
 * @throws 当源文件不存在时抛出异常
 */
function copyFile(relativeSource, relativeTarget) {
    const source = resolveFromRoot(relativeSource);
    const target = resolveFromRoot(relativeTarget);

    if (!fs.existsSync(source)) {
        throw new Error(`Missing required file: ${relativeSource}`);
    }

    ensureParentDir(target);
    fs.copyFileSync(source, target);
}

/**
 * 处理目录相关逻辑并返回结果
 * @param relativeSource - 源资源相对路径
 * @param relativeTarget - 目标资源相对路径
 * @throws 当源目录不存在时抛出异常
 */
function copyDirectory(relativeSource, relativeTarget) {
    const source = resolveFromRoot(relativeSource);
    const target = resolveFromRoot(relativeTarget);

    if (!fs.existsSync(source)) {
        throw new Error(`Missing required directory: ${relativeSource}`);
    }

    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, target, { recursive: true });
}

/**
 * 处理目录相关逻辑并返回结果
 * @param relativeTarget - 目标资源相对路径
 */
function resetDirectory(relativeTarget) {
    const target = resolveFromRoot(relativeTarget);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
}

resetDirectory('resources/vendor');

// 第三方静态资源复制清单（源路径 -> 目标路径）
const FILES_TO_COPY = [
    ['node_modules/@vscode/codicons/dist/codicon.css', 'resources/vendor/codicons/codicon.css'],
    ['node_modules/@vscode/codicons/dist/codicon.ttf', 'resources/vendor/codicons/codicon.ttf'],
    ['node_modules/katex/dist/katex.min.css', 'resources/vendor/katex/katex.min.css'],
    ['node_modules/katex/dist/katex.min.js', 'resources/vendor/katex/katex.min.js'],
    ['node_modules/mermaid/dist/mermaid.min.js', 'resources/vendor/mermaid/mermaid.min.js']
];

for (const [source, target] of FILES_TO_COPY) {
    copyFile(source, target);
}

copyDirectory('node_modules/katex/dist/fonts', 'resources/vendor/katex/fonts');

console.log('Vendor assets prepared in resources/vendor.');
