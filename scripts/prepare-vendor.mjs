import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 定义仓库根目录绝对路径供资源复制统一复用
const ROOT_PATH = path.resolve(__dirname, '..');

/**
 * 基于仓库根目录拼接相对路径
 * @param relativePath - 相对于仓库根目录的路径
 * @returns 返回拼接后的绝对路径
 */
function resolveFromRoot(relativePath) {
    return path.join(ROOT_PATH, relativePath);
}

/**
 * 确保目标文件的父目录存在
 * @param filePath - 目标文件绝对路径
 */
function ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * 复制单个静态资源到打包目录
 * @param relativeSource - 源文件相对路径
 * @param relativeTarget - 目标文件相对路径
 * @throws {Error} 当源文件不存在时抛出异常
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
 * 复制整目录静态资源到打包目录
 * @param relativeSource - 源目录相对路径
 * @param relativeTarget - 目标目录相对路径
 * @throws {Error} 当源目录不存在时抛出异常
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
 * 重置目标目录并创建空目录用于重新生成
 * @param relativeTarget - 目标目录相对路径
 */
function resetDirectory(relativeTarget) {
    const target = resolveFromRoot(relativeTarget);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
}

resetDirectory('resources/vendor');

// 维护打包时需要复制的静态资源映射关系
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
