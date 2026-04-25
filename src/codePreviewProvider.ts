import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { XMLParser } from 'fast-xml-parser';
import { FileType, PreviewResult } from './fileTypes';
import { escapeHtml, escapeRegex } from './utils';

/**
 * 描述 KeyLineLocator 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface KeyLineLocator {
    next(key: string, parentPath?: string[]): number;
}

/**
 * 描述 ArrayItemLineLocator 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface ArrayItemLineLocator {
    next(): number;
}

/**
 * 描述 JsonCloseLineLocator 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface JsonCloseLineLocator {
    next(line: number): number;
}

/**
 * 描述 YamlCloseLineLocator 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface YamlCloseLineLocator {
    next(line: number): number;
}

/**
 * 描述 XmlCloseLineLocator 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface XmlCloseLineLocator {
    next(line: number): number;
}

/**
 * 描述 XmlTagMatch 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface XmlTagMatch {
    tagName: string;
    attributesSource: string;
}

/**
 * 描述 XmlCommentScanState 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface XmlCommentScanState {
    inComment: boolean;
    parts: string[];
}

/**
 * 描述 XmlLineCommentScanResult 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface XmlLineCommentScanResult {
    nonCommentText: string;
    comments: string[];
}

type CommentMarker = '/' | '*' | '#' | '-';

/**
 * 描述 CommentEntry 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface CommentEntry {
    marker: CommentMarker;
    text: string;
}

type CommentLineIndex = Map<number, CommentEntry[]>;

/**
 * 描述 StandaloneCommentGroup 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface StandaloneCommentGroup {
    line: number;
    comments: CommentEntry[];
    rootOnly?: boolean;
}

/**
 * 描述 StandaloneCommentCursor 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface StandaloneCommentCursor {
    groups: StandaloneCommentGroup[];
    index: number;
}

/**
 * 描述 CommentMetadata 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface CommentMetadata {
    lineComments: CommentLineIndex;
    standaloneGroups: StandaloneCommentGroup[];
}

/**
 * 提供 CodePreview 相关预览能力
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
export class CodePreviewProvider {
    private static readonly MAX_HTML_LENGTH = 10 * 1024 * 1024;

    /**
     * 解析数据文件内容，返回树形结构的 HTML
     * @param content - content 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    static parse(content: string, fileType: FileType): PreviewResult {
        try {
            const parsed = this.parseContent(content, fileType);
            const lines = content.split('\n');
            const commentMetadata = this.buildCommentMetadata(lines, fileType);
            const lineLocator = this.createKeyLineLocator(lines, fileType);
            const arrayItemLineLocator = this.createArrayItemLineLocator(lines, fileType, parsed);
            const jsonCloseLineLocator = fileType === 'json' ? this.createJsonCloseLineLocator(lines) : null;
            const yamlCloseLineLocator = fileType === 'yaml' ? this.createYamlCloseLineLocator(lines) : null;
            const xmlCloseLineLocator = fileType === 'xml' ? this.createXmlCloseLineLocator(lines) : null;
            const html = this.renderTree(
                parsed,
                lineLocator,
                arrayItemLineLocator,
                commentMetadata.lineComments,
                commentMetadata.standaloneGroups,
                fileType,
                lines,
                jsonCloseLineLocator,
                yamlCloseLineLocator,
                xmlCloseLineLocator
            );
            const wrappedHtml = `<div class="data-tree">${html}</div>`;

            if (wrappedHtml.length > this.MAX_HTML_LENGTH) {
                return {
                    html: '<div class="error-state"><div class="error-text">Preview content is too large to render safely.</div></div>',
                    fileType,
                    supportsLocate: false,
                };
            }

            return {
                html: wrappedHtml,
                fileType,
                supportsLocate: false,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                html: `<div class="error-state"><div class="error-text">Failed to parse ${fileType.toUpperCase()} content.</div><pre class="error-detail">${escapeHtml(message)}</pre></div>`,
                fileType,
                supportsLocate: false,
            };
        }
    }

    /**
     * 解析文件内容
     * @param content - content 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static parseContent(content: string, fileType: FileType): unknown {
        switch (fileType) {
            case 'json':
                return this.parseJsonOrJsonc(content);
            case 'yaml': {
                const docs = yaml.loadAll(content);
                return docs.length === 1 ? docs[0] : docs;
            }
            case 'toml':
                return toml.parse(content);
            case 'xml':
                return this.parseXml(content);
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    /**
     * 创建键行定位器并返回可复用实例
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createKeyLineLocator(lines: string[], fileType: FileType): KeyLineLocator {
        const primaryIndex = this.buildPrimaryKeyLineIndex(lines, fileType);
        const primaryCursor = new Map<string, number>();
        const tomlPathIndex = fileType === 'toml' ? this.buildTomlPathLineIndex(lines) : null;
        const tomlPathCursor = new Map<string, number>();

        // 对少数主索引未覆盖的 key 做按需兜底，避免极端格式丢定位
        const fallbackIndex = new Map<string, number[]>();
        const fallbackCursor = new Map<string, number>();

        return {
            next: (key: string, parentPath: string[] = []): number => {
                if (tomlPathIndex) {
                    const path = [...parentPath, key].filter(Boolean).join('.');
                    if (path.length > 0) {
                        const fromTomlPath = this.consumeIndexedLine(tomlPathIndex, tomlPathCursor, path);
                        if (fromTomlPath >= 0) {
                            return fromTomlPath;
                        }
                    }
                }

                const fromPrimary = this.consumeIndexedLine(primaryIndex, primaryCursor, key);
                if (fromPrimary >= 0) {
                    return fromPrimary;
                }

                if (!fallbackIndex.has(key)) {
                    fallbackIndex.set(key, this.buildFallbackKeyLines(key, lines, fileType));
                }
                return this.consumeIndexedLine(fallbackIndex, fallbackCursor, key);
            }
        };
    }

    /**
     * 构建TOML路径行索引供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildTomlPathLineIndex(lines: string[]): Map<string, number[]> {
        const explicitIndex = new Map<string, number[]>();
        const implicitIndex = new Map<string, number[]>();
        let currentTablePath: string[] = [];

        const pushPath = (segments: string[], line: number, explicit: boolean): void => {
            if (segments.length === 0) {
                return;
            }
            this.pushIndexedLine(explicit ? explicitIndex : implicitIndex, segments.join('.'), line);
        };

        const pushTablePathPrefixes = (segments: string[], line: number): void => {
            if (segments.length === 0) {
                return;
            }

            for (let depth = 1; depth <= segments.length; depth++) {
                pushPath(segments.slice(0, depth), line, depth === segments.length);
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const codeLine = this.stripHashCommentText(lines[i]);
            const trimmed = codeLine.trim();
            if (trimmed.length === 0) {
                continue;
            }

            const tableArrayMatch = trimmed.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
            if (tableArrayMatch) {
                currentTablePath = this.splitTomlPath(tableArrayMatch[1]);
                pushTablePathPrefixes(currentTablePath, i);
                continue;
            }

            const tableMatch = trimmed.match(/^\[\s*([^\]]+?)\s*\]$/);
            if (tableMatch) {
                currentTablePath = this.splitTomlPath(tableMatch[1]);
                pushTablePathPrefixes(currentTablePath, i);
                continue;
            }

            const assignMatch =
                codeLine.match(/^\s*([A-Za-z0-9_.-]+)\s*=/) ||
                codeLine.match(/^\s*"([^"]+)"\s*=/) ||
                codeLine.match(/^\s*'([^']+)'\s*=/);
            if (!assignMatch) {
                continue;
            }

            const relativePath = this.splitTomlPath(assignMatch[1]);
            if (relativePath.length === 0) {
                continue;
            }

            pushPath([...currentTablePath, ...relativePath], i, true);
        }

        const index = new Map<string, number[]>();
        const allKeys = new Set<string>([
            ...explicitIndex.keys(),
            ...implicitIndex.keys(),
        ]);

        for (const key of allKeys) {
            const explicitLines = explicitIndex.get(key) ?? [];
            const implicitLines = implicitIndex.get(key) ?? [];
            index.set(key, [...explicitLines, ...implicitLines]);
        }

        return index;
    }

    /**
     * 创建数组元素行定位器并返回可复用实例
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @param parsedData - parsedData 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createArrayItemLineLocator(lines: string[], fileType: FileType, parsedData: unknown): ArrayItemLineLocator {
        const itemLines = this.buildArrayItemLineIndex(lines, fileType, parsedData);
        let cursor = 0;

        return {
            next: (): number => {
                if (cursor >= itemLines.length) {
                    return -1;
                }
                const line = itemLines[cursor];
                cursor += 1;
                return line;
            }
        };
    }

    /**
     * 创建YAML 结束行定位器并返回可复用实例
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createYamlCloseLineLocator(lines: string[]): YamlCloseLineLocator {
        const cache = new Map<number, number>();

        return {
            next: (line: number): number => {
                if (line < 0 || line >= lines.length) {
                    return -1;
                }

                const cached = cache.get(line);
                if (cached !== undefined) {
                    return cached;
                }

                const startIndent = this.getIndentation(lines[line]);
                for (let row = line + 1; row < lines.length; row++) {
                    const trimmed = lines[row].trim();
                    if (trimmed.length === 0) {
                        continue;
                    }

                    const indent = this.getIndentation(lines[row]);
                    if (indent <= startIndent) {
                        cache.set(line, row);
                        return row;
                    }
                }

                cache.set(line, -1);
                return -1;
            }
        };
    }

    /**
     * 创建XML 结束行定位器并返回可复用实例
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createXmlCloseLineLocator(lines: string[]): XmlCloseLineLocator {
        const closeLineMap = new Map<number, number>();
        const stack: Array<{ tagName: string; line: number }> = [];
        const scanState: XmlCommentScanState = {
            inComment: false,
            parts: [],
        };

        for (let i = 0; i < lines.length; i++) {
            const scan = this.scanXmlLineComments(lines[i], scanState);
            const code = scan.nonCommentText;
            const pattern = /<\s*(\/)?\s*([A-Za-z_:][\w:.-]*)([^<>]*?)>/g;

            let match: RegExpExecArray | null;
            while ((match = pattern.exec(code)) !== null) {
                const raw = match[0];
                const isClosing = Boolean(match[1]);
                const tagName = match[2];

                if (raw.startsWith('<?') || raw.startsWith('<!')) {
                    continue;
                }

                if (isClosing) {
                    for (let j = stack.length - 1; j >= 0; j--) {
                        if (stack[j].tagName !== tagName) {
                            continue;
                        }

                        const open = stack.splice(j, 1)[0];
                        if (!closeLineMap.has(open.line)) {
                            closeLineMap.set(open.line, i);
                        }
                        break;
                    }
                    continue;
                }

                const isSelfClosing = /\/\s*>$/.test(raw);
                if (isSelfClosing) {
                    if (!closeLineMap.has(i)) {
                        closeLineMap.set(i, i);
                    }
                    continue;
                }

                stack.push({ tagName, line: i });
            }
        }

        return {
            next: (line: number): number => closeLineMap.get(line) ?? -1,
        };
    }

    /**
     * 创建JSON 结束行定位器并返回可复用实例
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createJsonCloseLineLocator(lines: string[]): JsonCloseLineLocator {
        const sanitizedLines = this.stripJsoncComments(lines.join('\n')).split('\n');
        const cache = new Map<number, number>();

        return {
            next: (line: number): number => {
                if (line < 0 || line >= sanitizedLines.length) {
                    return -1;
                }

                const cached = cache.get(line);
                if (cached !== undefined) {
                    return cached;
                }

                const start = this.findJsonCompoundStartInLine(sanitizedLines[line]);
                if (!start) {
                    cache.set(line, -1);
                    return -1;
                }

                const opener = start.char;
                const closer = opener === '{' ? '}' : ']';
                let depth = 0;

                for (let row = line; row < sanitizedLines.length; row++) {
                    const code = sanitizedLines[row];
                    let inString = false;
                    let escape = false;
                    const startColumn = row === line ? start.column : 0;

                    for (let col = startColumn; col < code.length; col++) {
                        const ch = code[col];

                        if (inString) {
                            if (escape) {
                                escape = false;
                                continue;
                            }

                            if (ch === '\\') {
                                escape = true;
                                continue;
                            }

                            if (ch === '"') {
                                inString = false;
                            }
                            continue;
                        }

                        if (ch === '"') {
                            inString = true;
                            continue;
                        }

                        if (ch === opener) {
                            depth += 1;
                            continue;
                        }

                        if (ch === closer) {
                            depth -= 1;
                            if (depth === 0) {
                                cache.set(line, row);
                                return row;
                            }
                        }
                    }
                }

                cache.set(line, -1);
                return -1;
            }
        };
    }

    /**
     * 查找JSON 复合起始行并返回匹配结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findJsonCompoundStartInLine(line: string): { char: '{' | '['; column: number } | null {
        let inString = false;
        let escape = false;
        let colonSeen = false;
        let firstTokenIndex = -1;
        let firstTokenChar = '';

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (inString) {
                if (escape) {
                    escape = false;
                    continue;
                }

                if (ch === '\\') {
                    escape = true;
                    continue;
                }

                if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (firstTokenIndex < 0 && !/\s|,/.test(ch)) {
                firstTokenIndex = i;
                firstTokenChar = ch;
            }

            if (ch === ':') {
                colonSeen = true;
                continue;
            }

            if ((ch === '{' || ch === '[') && colonSeen) {
                return { char: ch, column: i };
            }
        }

        if ((firstTokenChar === '{' || firstTokenChar === '[') && firstTokenIndex >= 0) {
            return { char: firstTokenChar, column: firstTokenIndex };
        }

        return null;
    }

    /**
     * 构建数组元素行索引供后续流程复用
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @param parsedData - parsedData 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildArrayItemLineIndex(lines: string[], fileType: FileType, parsedData: unknown): number[] {
        switch (fileType) {
            case 'json':
                return this.buildJsonArrayItemLineIndex(lines);
            case 'yaml':
                return this.buildYamlArrayItemLineIndex(lines, this.shouldUseYamlDocumentArrayLines(parsedData, lines));
            case 'toml':
                return this.buildTomlArrayItemLineIndex(lines);
            case 'xml':
                return this.buildXmlArrayItemLineIndex(lines);
            default:
                return [];
        }
    }

    /**
     * 处理YAML 文档数组行集合相关逻辑并返回结果
     * @param parsedData - parsedData 参数
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static shouldUseYamlDocumentArrayLines(parsedData: unknown, lines: string[]): boolean {
        if (!Array.isArray(parsedData)) {
            return false;
        }

        return lines.some(line => /^\s*---(?:\s+#.*)?\s*$/.test(line));
    }

    /**
     * 构建JSON数组元素行索引供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildJsonArrayItemLineIndex(lines: string[]): number[] {
        const sanitizedLines = this.stripJsoncComments(lines.join('\n')).split('\n');
        const result: number[] = [];
        const stack: Array<'object' | 'array'> = [];

        for (let i = 0; i < sanitizedLines.length; i++) {
            const line = sanitizedLines[i];
            const top = stack.length > 0 ? stack[stack.length - 1] : null;
            const firstToken = this.findJsonLineFirstToken(line);

            if (top === 'array' && this.isJsonArrayValueStart(firstToken)) {
                result.push(i);
            }

            let inString = false;
            let escape = false;

            for (let j = 0; j < line.length; j++) {
                const ch = line[j];

                if (inString) {
                    if (escape) {
                        escape = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escape = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    continue;
                }

                if (ch === '[') {
                    stack.push('array');
                    continue;
                }
                if (ch === '{') {
                    stack.push('object');
                    continue;
                }
                if ((ch === ']' || ch === '}') && stack.length > 0) {
                    stack.pop();
                }
            }
        }

        return result;
    }

    /**
     * 查找JSON 行首标记并返回匹配结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findJsonLineFirstToken(line: string): string | null {
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (/\s/.test(ch) || ch === ',') {
                continue;
            }
            return ch;
        }
        return null;
    }

    /**
     * 判断JSON 数组值起始是否成立
     * @param token - token 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static isJsonArrayValueStart(token: string | null): boolean {
        if (!token) {
            return false;
        }

        if (token === '{' || token === '[' || token === '"' || token === '-' || token === 't' || token === 'f' || token === 'n') {
            return true;
        }

        return /[0-9]/.test(token);
    }

    /**
     * 构建YAML数组元素行索引供后续流程复用
     * @param lines - lines 参数
     * @param includeDocumentRootItems - includeDocumentRootItems 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildYamlArrayItemLineIndex(lines: string[], includeDocumentRootItems: boolean): number[] {
        const result: number[] = [];

        if (includeDocumentRootItems) {
            result.push(...this.findYamlDocumentStartLines(lines));
        }

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.length === 0 || trimmed.startsWith('#')) {
                continue;
            }
            if (/^-\s+/.test(trimmed) || trimmed === '-') {
                result.push(i);
            }
        }

        return [...new Set(result)].sort((a, b) => a - b);
    }

    /**
     * 查找YAML 文档起始行集合并返回匹配结果
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findYamlDocumentStartLines(lines: string[]): number[] {
        const starts: number[] = [];

        const pushFirstBindableFrom = (start: number): void => {
            for (let i = start; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (
                    trimmed.length === 0
                    || trimmed.startsWith('#')
                    || trimmed === '---'
                    || trimmed === '...'
                ) {
                    continue;
                }

                starts.push(i);
                return;
            }
        };

        pushFirstBindableFrom(0);
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*---(?:\s+#.*)?\s*$/.test(lines[i])) {
                pushFirstBindableFrom(i + 1);
            }
        }

        return starts;
    }

    /**
     * 构建TOML数组元素行索引供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildTomlArrayItemLineIndex(lines: string[]): number[] {
        const result: number[] = [];
        let arrayDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const codeLine = this.stripHashCommentText(lines[i]);
            const trimmed = codeLine.trim();
            if (trimmed.length === 0) {
                continue;
            }

            if (arrayDepth > 0) {
                const firstToken = this.findTomlArrayItemFirstToken(trimmed);
                if (firstToken && firstToken !== ']') {
                    result.push(i);
                }

                arrayDepth += this.countSquareBracketDelta(codeLine);
                if (arrayDepth < 0) {
                    arrayDepth = 0;
                }
                continue;
            }

            if (/^\s*\[\[.*\]\]\s*$/.test(trimmed) || /^\s*\[.*\]\s*$/.test(trimmed)) {
                continue;
            }

            const equalIndex = codeLine.indexOf('=');
            if (equalIndex < 0) {
                continue;
            }

            const rhs = codeLine.slice(equalIndex + 1);
            const arrayStart = this.findTomlArrayStart(rhs);
            if (arrayStart < 0) {
                continue;
            }

            const afterStart = rhs.slice(arrayStart + 1).trim();
            if (afterStart.length > 0 && !afterStart.startsWith(']')) {
                result.push(i);
            }

            arrayDepth = this.countSquareBracketDelta(rhs.slice(arrayStart));
            if (arrayDepth < 0) {
                arrayDepth = 0;
            }
        }

        return result;
    }

    /**
     * 构建XML数组元素行索引供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildXmlArrayItemLineIndex(lines: string[]): number[] {
        const result: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const tagMatches = this.extractXmlTagMatches(lines[i]);
            for (let j = 0; j < tagMatches.length; j++) {
                result.push(i);
            }
        }

        return result;
    }

    /**
     * 查找TOML 数组元素首个标记并返回匹配结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findTomlArrayItemFirstToken(line: string): string | null {
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (/\s/.test(ch) || ch === ',') {
                continue;
            }
            return ch;
        }
        return null;
    }

    /**
     * 查找TOML 数组起始并返回匹配结果
     * @param text - text 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findTomlArrayStart(text: string): number {
        let inSingle = false;
        let inDouble = false;
        let escape = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (inDouble) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inDouble = false;
                }
                continue;
            }

            if (inSingle) {
                if (ch === '\'') {
                    inSingle = false;
                }
                continue;
            }

            if (ch === '"') {
                inDouble = true;
                continue;
            }
            if (ch === '\'') {
                inSingle = true;
                continue;
            }
            if (ch === '[') {
                return i;
            }
        }

        return -1;
    }

    /**
     * 统计方括号深度增量用于流程判断
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static countSquareBracketDelta(line: string): number {
        let inSingle = false;
        let inDouble = false;
        let escape = false;
        let delta = 0;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (inDouble) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inDouble = false;
                }
                continue;
            }

            if (inSingle) {
                if (ch === '\'') {
                    inSingle = false;
                }
                continue;
            }

            if (ch === '"') {
                inDouble = true;
                continue;
            }
            if (ch === '\'') {
                inSingle = true;
                continue;
            }
            if (ch === '[') {
                delta += 1;
                continue;
            }
            if (ch === ']') {
                delta -= 1;
            }
        }

        return delta;
    }

    /**
     * 解析JSON 或 JSONC并返回结构化结果
     * @param content - content 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static parseJsonOrJsonc(content: string): unknown {
        try {
            return JSON.parse(content);
        } catch (_error) {
            return JSON.parse(this.sanitizeJsonc(content));
        }
    }

    /**
     * 解析XML并返回结构化结果
     * @param content - content 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static parseXml(content: string): unknown {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@',
            textNodeName: '#text',
            cdataPropName: '#cdata',
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: true,
            removeNSPrefix: false,
            processEntities: true,
            ignoreDeclaration: false,
            ignorePiTags: false,
        });

        const parsed = parser.parse(content) as unknown;
        return this.normalizeXmlValue(parsed);
    }

    /**
     * 归一化XML值以统一后续处理
     * @param value - value 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static normalizeXmlValue(value: unknown): unknown {
        if (Array.isArray(value)) {
            const normalizedItems = value
                .map(item => this.normalizeXmlValue(item))
                .filter(item => item !== undefined);
            return normalizedItems;
        }

        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value !== 'object') {
            return value;
        }

        const attributes: Array<[string, unknown]> = [];
        const others: Array<[string, unknown]> = [];

        for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
            const next = this.normalizeXmlValue(raw);

            if (this.isXmlTextLikeKey(key)) {
                const text = typeof next === 'string' ? next.trim() : String(next ?? '').trim();
                if (text.length > 0) {
                    others.push([key, text]);
                }
                continue;
            }

            if (Array.isArray(next) && next.length === 0) {
                continue;
            }

            if (next === undefined) {
                continue;
            }

            if (this.isXmlAttributeKey(key)) {
                attributes.push([key, next]);
            } else {
                others.push([key, next]);
            }
        }

        const normalized: Record<string, unknown> = {};
        for (const [key, val] of [...attributes, ...others]) {
            normalized[key] = val;
        }

        return normalized;
    }

    /**
     * 判断XML 类文本键是否成立
     * @param key - key 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static isXmlTextLikeKey(key: string): boolean {
        return key === '#text' || key === '#cdata';
    }

    /**
     * 判断XML 属性键是否成立
     * @param key - key 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static isXmlAttributeKey(key: string): boolean {
        return key.startsWith('@');
    }

    /**
     * 处理JSONC相关逻辑并返回结果
     * @param content - content 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static sanitizeJsonc(content: string): string {
        const withoutComments = this.stripJsoncComments(content);
        return this.stripJsonTrailingCommas(withoutComments);
    }

    /**
     * 去除JSONC注释集合以保留有效信息
     * @param content - content 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static stripJsoncComments(content: string): string {
        let out = '';
        let inString = false;
        let escape = false;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            const next = i + 1 < content.length ? content[i + 1] : '';

            if (inString) {
                out += ch;
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                out += ch;
                continue;
            }

            if (ch === '/' && next === '/') {
                while (i < content.length && content[i] !== '\n') {
                    out += ' ';
                    i++;
                }
                if (i < content.length && content[i] === '\n') {
                    out += '\n';
                }
                continue;
            }

            if (ch === '/' && next === '*') {
                out += ' ';
                out += ' ';
                i += 2;
                while (i < content.length) {
                    const current = content[i];
                    const following = i + 1 < content.length ? content[i + 1] : '';
                    if (current === '*' && following === '/') {
                        out += ' ';
                        out += ' ';
                        i++;
                        break;
                    }
                    out += current === '\n' ? '\n' : ' ';
                    i++;
                }
                continue;
            }

            out += ch;
        }

        return out;
    }

    /**
     * 去除JSON 尾随逗号以保留有效信息
     * @param content - content 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static stripJsonTrailingCommas(content: string): string {
        let out = '';
        let inString = false;
        let escape = false;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];

            if (inString) {
                out += ch;
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                out += ch;
                continue;
            }

            if (ch === ',') {
                let j = i + 1;
                while (j < content.length && /\s/.test(content[j])) {
                    j++;
                }
                if (j < content.length && (content[j] === '}' || content[j] === ']')) {
                    continue;
                }
            }

            out += ch;
        }

        return out;
    }

    /**
     * 处理 consumeIndexedLine 相关逻辑
     * @param index - 参数
     * @param cursor - 参数
     * @param key - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static consumeIndexedLine(
        index: Map<string, number[]>,
        cursor: Map<string, number>,
        key: string
    ): number {
        const candidates = index.get(key);
        if (!candidates || candidates.length === 0) {
            return -1;
        }

        const current = cursor.get(key) ?? 0;
        if (current >= candidates.length) {
            return -1;
        }

        cursor.set(key, current + 1);
        return candidates[current];
    }

    /**
     * 构建主键行索引供后续流程复用
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildPrimaryKeyLineIndex(lines: string[], fileType: FileType): Map<string, number[]> {
        const index = new Map<string, number[]>();
        const xmlLastPushed = new Map<string, { line: number; indent: number }>();

        for (let i = 0; i < lines.length; i++) {
            const keys = this.extractKeysFromLine(lines[i], fileType);
            for (const key of keys) {
                if (fileType === 'xml' && !this.isXmlAttributeKey(key)) {
                    const currentIndent = this.getIndentation(lines[i]);
                    const previous = xmlLastPushed.get(key);
                    if (previous && previous.line === i - 1 && previous.indent === currentIndent) {
                        previous.line = i;
                        continue;
                    }
                    xmlLastPushed.set(key, { line: i, indent: currentIndent });
                }
                this.pushIndexedLine(index, key, i);
            }
        }

        return index;
    }

    /**
     * 构建兜底键行集合供后续流程复用
     * @param key - key 参数
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildFallbackKeyLines(key: string, lines: string[], fileType: FileType): number[] {
        const escaped = escapeRegex(key);
        const patterns: RegExp[] = [];

        switch (fileType) {
            case 'json':
                patterns.push(new RegExp(`^\\s*"${escaped}"\\s*(?:(?:\\/\\*.*?\\*\\/)\\s*)*:`));
                break;
            case 'yaml':
                patterns.push(new RegExp(`^\\s*(?:-\\s+)?(?:"${escaped}"|'${escaped}'|${escaped})\\s*:`));
                break;
            case 'toml':
                patterns.push(new RegExp(`^\\s*(?:"${escaped}"|'${escaped}'|${escaped})\\s*=`));
                patterns.push(new RegExp(`\\[(?:[^\\]]*\\.)?${escaped}\\]`));
                patterns.push(new RegExp(`\\[\\[(?:[^\\]]*\\.)?${escaped}\\]\\]`));
                break;
            case 'xml': {
                if (key.startsWith('@')) {
                    const attr = escapeRegex(key.slice(1));
                    patterns.push(new RegExp(`<[^>]*\\b${attr}\\s*=\\s*["']`));
                } else if (key !== '#text' && key !== '#cdata') {
                    patterns.push(new RegExp(`<\\s*${escaped}\\b`));
                }
                break;
            }
        }

        if (patterns.length === 0) {
            return [];
        }

        const matches: number[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (patterns.some(pattern => pattern.test(lines[i]))) {
                matches.push(i);
            }
        }
        return matches;
    }

    /**
     * 提取行中的键供后续逻辑使用
     * @param line - line 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractKeysFromLine(line: string, fileType: FileType): string[] {
        switch (fileType) {
            case 'json':
                return this.extractJsonKeys(line);
            case 'yaml':
                return this.extractYamlKeys(line);
            case 'toml':
                return this.extractTomlKeys(line);
            case 'xml':
                return this.extractXmlKeys(line);
            default:
                return [];
        }
    }

    /**
     * 提取JSON 键供后续逻辑使用
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractJsonKeys(line: string): string[] {
        const match = line.match(/^\s*(?:\/\*.*?\*\/\s*)*"((?:\\.|[^"\\])*)"\s*(?:(?:\/\*.*?\*\/)\s*)*:/);
        if (!match) {
            return [];
        }
        return [this.decodeJsonString(match[1])];
    }

    /**
     * 提取YAML 键供后续逻辑使用
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractYamlKeys(line: string): string[] {
        const match = line.match(/^\s*(?:-\s+)?(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^:#][^:]*?))\s*:(?:\s|$)/);
        if (!match) {
            return [];
        }

        const key = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        return key ? [key] : [];
    }

    /**
     * 提取TOML 键供后续逻辑使用
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractTomlKeys(line: string): string[] {
        const keys: string[] = [];

        const tableArrayMatch = line.match(/^\s*\[\[\s*([^\]]+?)\s*\]\]\s*$/);
        if (tableArrayMatch) {
            keys.push(...this.splitTomlPath(tableArrayMatch[1]));
        }

        const tableMatch = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*$/);
        if (tableMatch) {
            keys.push(...this.splitTomlPath(tableMatch[1]));
        }

        const assignMatch =
            line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/) ||
            line.match(/^\s*"([^"]+)"\s*=/) ||
            line.match(/^\s*'([^']+)'\s*=/);
        if (assignMatch) {
            keys.push(...this.splitTomlPath(assignMatch[1]));
        }

        return keys;
    }

    /**
     * 提取XML 键供后续逻辑使用
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractXmlKeys(line: string): string[] {
        const keys: string[] = [];
        const matches = this.extractXmlTagMatches(line);

        for (const match of matches) {
            keys.push(match.tagName);
            keys.push(...this.extractXmlAttributeKeys(match.attributesSource));
        }

        return keys;
    }

    /**
     * 提取XML 标签匹配供后续逻辑使用
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractXmlTagMatches(line: string): XmlTagMatch[] {
        const tagMatches: XmlTagMatch[] = [];
        const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
        const pattern = /<\s*([A-Za-z_:][\w:.-]*)([^<>]*?)\/?>/g;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineWithoutComments)) !== null) {
            const raw = match[0];
            if (raw.startsWith('</') || raw.startsWith('<?') || raw.startsWith('<!')) {
                continue;
            }

            tagMatches.push({
                tagName: match[1],
                attributesSource: match[2] || '',
            });
        }

        return tagMatches;
    }

    /**
     * 提取XML 属性键供后续逻辑使用
     * @param attributesSource - attributesSource 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static extractXmlAttributeKeys(attributesSource: string): string[] {
        const keys: string[] = [];
        const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(attributesSource)) !== null) {
            keys.push(`@${match[1]}`);
        }

        return keys;
    }

    /**
     * 拆分TOML路径并返回片段集合
     * @param pathExpr - pathExpr 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static splitTomlPath(pathExpr: string): string[] {
        return pathExpr
            .split('.')
            .map(segment => segment.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean);
    }

    /**
     * 解码JSON 字符串并还原可读数据
     * @param raw - raw 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static decodeJsonString(raw: string): string {
        try {
            return JSON.parse(`"${raw}"`) as string;
        } catch (_error) {
            return raw;
        }
    }

    /**
     * 向目标集合追加带索引行
     * @param index - index 参数
     * @param key - key 参数
     * @param line - line 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private static pushIndexedLine(index: Map<string, number[]>, key: string, line: number): void {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
            return;
        }

        const existing = index.get(normalizedKey);
        if (existing) {
            existing.push(line);
            return;
        }

        index.set(normalizedKey, [line]);
    }

    /**
     * 构建注释元数据供后续流程复用
     * @param lines - lines 参数
     * @param fileType - fileType 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildCommentMetadata(lines: string[], fileType: FileType): CommentMetadata {
        const arrayItemLines = new Set(this.buildArrayItemLineIndex(lines, fileType, null));

        switch (fileType) {
            case 'json':
                return this.buildJsonCommentMetadata(lines, arrayItemLines);
            case 'yaml':
                return this.buildHashCommentMetadata(lines, 'yaml', arrayItemLines);
            case 'toml':
                return this.buildHashCommentMetadata(lines, 'toml', arrayItemLines);
            case 'xml':
                return this.buildXmlCommentMetadata(lines);
            default:
                return {
                    lineComments: new Map<number, CommentEntry[]>(),
                    standaloneGroups: [],
                };
        }
    }

    /**
     * 构建XML注释元数据供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildXmlCommentMetadata(lines: string[]): CommentMetadata {
        const lineComments = new Map<number, CommentEntry[]>();
        const standaloneGroups: StandaloneCommentGroup[] = [];
        const pending: CommentEntry[] = [];
        const preamble: CommentEntry[] = [];
        const scanState: XmlCommentScanState = {
            inComment: false,
            parts: [],
        };
        let pendingLine = -1;
        let pendingDepth = -1;
        let preambleLine = -1;
        let hasBoundNode = false;
        let xmlDepth = 0;

        const flushPreamble = (): void => {
            if (preamble.length === 0 || preambleLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, preambleLine, preamble);
            preamble.length = 0;
            preambleLine = -1;
        };

        const flushPendingStandalone = (rootOnly = false): void => {
            if (pending.length === 0 || pendingLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, pendingLine, pending, rootOnly);
            pending.length = 0;
            pendingLine = -1;
            pendingDepth = -1;
        };

        const pushCommentForCurrentContext = (text: string, line: number, depth: number): void => {
            if (!text) {
                return;
            }

            if (!hasBoundNode) {
                if (preamble.length === 0) {
                    preambleLine = line;
                }
                this.pushComment(preamble, '-', text);
                return;
            }

            if (pending.length > 0 && pendingDepth >= 0 && pendingDepth !== depth) {
                flushPendingStandalone();
            }

            if (pending.length === 0) {
                pendingLine = line;
                pendingDepth = depth;
            }
            this.pushComment(pending, '-', text);
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const scan = this.scanXmlLineComments(line, scanState);
            const currentDepth = xmlDepth;
            const nextDepth = Math.max(0, currentDepth + this.countXmlElementDepthDelta(scan.nonCommentText));
            const hasCode = scan.nonCommentText.trim().length > 0;
            const bindableLine = this.extractXmlKeys(scan.nonCommentText).length > 0;
            const commentOnlyLine = scan.comments.length > 0 && !hasCode;

            if (commentOnlyLine) {
                scan.comments.forEach(text => pushCommentForCurrentContext(text, i, currentDepth));
                xmlDepth = nextDepth;
                continue;
            }

            if (!hasBoundNode && bindableLine && preamble.length > 0) {
                pending.push(...preamble);
                pendingLine = pendingLine >= 0 ? pendingLine : preambleLine;
                pendingDepth = currentDepth;
                preamble.length = 0;
                preambleLine = -1;
            }

            if (bindableLine) {
                if (pending.length > 0 && pendingDepth >= 0 && currentDepth < pendingDepth) {
                    flushPendingStandalone();
                }

                const inlineComments = scan.comments.map(text => ({ marker: '-' as CommentMarker, text }));
                const comments = [...pending, ...inlineComments].filter(comment => !!comment.text);
                if (comments.length > 0) {
                    lineComments.set(i, comments);
                }
                pending.length = 0;
                pendingLine = -1;
                pendingDepth = -1;
                hasBoundNode = true;
                xmlDepth = nextDepth;
                continue;
            }

            if (scan.comments.length > 0) {
                scan.comments.forEach(text => pushCommentForCurrentContext(text, i, currentDepth));
            }

            if (pending.length > 0 && pendingDepth >= 0 && currentDepth < pendingDepth) {
                flushPendingStandalone();
            }

            if (pending.length > 0) {
                xmlDepth = nextDepth;
                continue;
            }

            if (hasCode) {
                if (!hasBoundNode) {
                    flushPreamble();
                }
                xmlDepth = nextDepth;
                continue;
            }

            xmlDepth = nextDepth;
        }

        if (scanState.inComment && scanState.parts.length > 0) {
            const tailComment = this.cleanXmlCommentText(scanState.parts.join('\n'));
            if (tailComment) {
                pushCommentForCurrentContext(tailComment, lines.length - 1, xmlDepth);
            }
        }

        flushPreamble();
        flushPendingStandalone(true);

        return { lineComments, standaloneGroups };
    }

    /**
     * 构建JSON注释元数据供后续流程复用
     * @param lines - lines 参数
     * @param arrayItemLines - arrayItemLines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildJsonCommentMetadata(lines: string[], arrayItemLines: Set<number>): CommentMetadata {
        const lineComments = new Map<number, CommentEntry[]>();
        const standaloneGroups: StandaloneCommentGroup[] = [];
        const pending: CommentEntry[] = [];
        const preamble: CommentEntry[] = [];
        const arrayDepthByLine = this.buildJsonArrayDepthAtLineStart(lines);
        const objectDepthByLine = this.buildJsonObjectDepthAtLineStart(lines);
        let pendingLine = -1;
        let pendingArrayDepth = -1;
        let pendingObjectDepth = -1;
        let preambleLine = -1;
        let inBlockComment = false;
        let blockParts: string[] = [];
        let hasBoundNode = false;

        const flushPreamble = (): void => {
            if (preamble.length === 0 || preambleLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, preambleLine, preamble);
            preamble.length = 0;
            preambleLine = -1;
        };

        const flushPendingStandalone = (): void => {
            if (pending.length === 0 || pendingLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, pendingLine, pending);
            pending.length = 0;
            pendingLine = -1;
            pendingArrayDepth = -1;
            pendingObjectDepth = -1;
        };

        const pushCommentForCurrentContext = (
            marker: CommentMarker,
            text: string,
            line: number,
            arrayDepth: number,
            objectDepth: number
        ): void => {
            if (!text) {
                return;
            }

            if (!hasBoundNode) {
                if (preamble.length === 0) {
                    preambleLine = line;
                }
                this.pushComment(preamble, marker, text);
                return;
            }

            if (
                pending.length > 0
                && pendingArrayDepth >= 0
                && pendingObjectDepth >= 0
                && (pendingArrayDepth !== arrayDepth || pendingObjectDepth !== objectDepth)
            ) {
                flushPendingStandalone();
            }

            if (pending.length === 0) {
                pendingLine = line;
                pendingArrayDepth = arrayDepth;
                pendingObjectDepth = objectDepth;
            }
            this.pushComment(pending, marker, text);
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const keyExists = this.extractJsonKeys(line).length > 0;
            const arrayItemExists = arrayItemLines.has(i);
            const inlineComments = this.findJsonInlineComments(line);
            const bindableLine = keyExists || arrayItemExists;
            const currentArrayDepth = arrayDepthByLine[i] ?? 0;
            const currentObjectDepth = objectDepthByLine[i] ?? 0;

            if (inBlockComment) {
                const end = line.indexOf('*/');
                if (end >= 0) {
                    blockParts.push(line.slice(0, end));
                    const merged = this.cleanCommentText(blockParts.join('\n'));
                    if (merged) {
                        pushCommentForCurrentContext('*', merged, i, currentArrayDepth, currentObjectDepth);
                    }
                    blockParts = [];
                    inBlockComment = false;

                    const trailing = line.slice(end + 2);
                    if (trailing.trim().length === 0) {
                        continue;
                    }

                    const trailingComments = this.findJsonInlineComments(trailing);
                    if (trailingComments.length > 0) {
                        trailingComments.forEach(comment => {
                            pushCommentForCurrentContext(comment.marker, comment.text, i, currentArrayDepth, currentObjectDepth);
                        });
                        continue;
                    }
                } else {
                    blockParts.push(line);
                    continue;
                }
            }

            if (/^\s*\/\//.test(line)) {
                const onlyComment = this.cleanCommentText(line.replace(/^\s*\/\//, ''));
                if (onlyComment) {
                    pushCommentForCurrentContext('/', onlyComment, i, currentArrayDepth, currentObjectDepth);
                }
                continue;
            }

            if (/^\s*\/\*/.test(line)) {
                const singleLineBlock = line.match(/^\s*\/\*(.*?)\*\/\s*$/);
                if (singleLineBlock) {
                    const onlyComment = this.cleanCommentText(singleLineBlock[1]);
                    if (onlyComment) {
                        pushCommentForCurrentContext('*', onlyComment, i, currentArrayDepth, currentObjectDepth);
                    }
                    continue;
                }

                const rest = line.replace(/^\s*\/\*/, '');
                const end = rest.indexOf('*/');
                if (end >= 0) {
                    const onlyComment = this.cleanCommentText(rest.slice(0, end));
                    if (onlyComment) {
                        pushCommentForCurrentContext('*', onlyComment, i, currentArrayDepth, currentObjectDepth);
                    }

                    const trailing = rest.slice(end + 2);
                    if (trailing.trim().length === 0) {
                        continue;
                    }

                    const trailingKeyExists = this.extractJsonKeys(trailing).length > 0;
                    const trailingArrayItemExists = arrayItemLines.has(i);
                    const trailingBindableLine = trailingKeyExists || trailingArrayItemExists;
                    const trailingInlineComments = this.findJsonInlineComments(trailing);

                    if (!hasBoundNode && trailingBindableLine && preamble.length > 0) {
                        pending.push(...preamble);
                        pendingLine = pendingLine >= 0 ? pendingLine : preambleLine;
                        pendingArrayDepth = currentArrayDepth;
                        pendingObjectDepth = currentObjectDepth;
                        preamble.length = 0;
                        preambleLine = -1;
                    }

                    if (trailingBindableLine) {
                        if (pending.length > 0 && pendingObjectDepth >= 0 && currentObjectDepth < pendingObjectDepth) {
                            flushPendingStandalone();
                        }

                        if (pending.length > 0 && pendingArrayDepth > 0 && !trailingArrayItemExists && currentArrayDepth < pendingArrayDepth) {
                            flushPendingStandalone();
                        }

                        const comments = [...pending, ...trailingInlineComments].filter(comment => !!comment.text);
                        if (comments.length > 0) {
                            lineComments.set(i, comments);
                        }
                        pending.length = 0;
                        pendingLine = -1;
                        pendingArrayDepth = -1;
                        pendingObjectDepth = -1;
                        hasBoundNode = true;
                        continue;
                    }

                    if (!hasBoundNode && trailingInlineComments.length > 0) {
                        if (preamble.length === 0) {
                            preambleLine = i;
                        }
                        preamble.push(...trailingInlineComments);
                    }

                    continue;
                }

                inBlockComment = true;
                blockParts = [rest];
                continue;
            }

            if (!hasBoundNode && bindableLine && preamble.length > 0) {
                pending.push(...preamble);
                pendingLine = pendingLine >= 0 ? pendingLine : preambleLine;
                pendingArrayDepth = currentArrayDepth;
                pendingObjectDepth = currentObjectDepth;
                preamble.length = 0;
                preambleLine = -1;
            }

            if (bindableLine) {
                if (pending.length > 0 && pendingObjectDepth >= 0 && currentObjectDepth < pendingObjectDepth) {
                    flushPendingStandalone();
                }

                if (pending.length > 0 && pendingArrayDepth > 0 && !arrayItemExists && currentArrayDepth < pendingArrayDepth) {
                    flushPendingStandalone();
                }

                const comments = [...pending, ...inlineComments].filter(comment => !!comment.text);
                if (comments.length > 0) {
                    lineComments.set(i, comments);
                }
                pending.length = 0;
                pendingLine = -1;
                pendingArrayDepth = -1;
                pendingObjectDepth = -1;
                hasBoundNode = true;
                continue;
            }

            if (!hasBoundNode && inlineComments.length > 0) {
                if (preamble.length === 0) {
                    preambleLine = i;
                }
                preamble.push(...inlineComments);
                continue;
            }

            if (pending.length > 0 && pendingArrayDepth > 0 && currentArrayDepth < pendingArrayDepth) {
                flushPendingStandalone();
            }

            if (pending.length > 0 && pendingObjectDepth >= 0 && currentObjectDepth < pendingObjectDepth) {
                flushPendingStandalone();
            }

            if (pending.length > 0) {
                continue;
            }

            if (trimmed.length === 0) {
                continue;
            }

            pending.length = 0;
            pendingLine = -1;
            pendingArrayDepth = -1;
            pendingObjectDepth = -1;

            if (!hasBoundNode) {
                flushPreamble();
            }
        }

        flushPreamble();
        flushPendingStandalone();

        return { lineComments, standaloneGroups };
    }

    /**
     * 处理 buildHashCommentMetadata 相关逻辑
     * @param lines - 参数
     * @param fileType - 参数
     * @param arrayItemLines - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildHashCommentMetadata(
        lines: string[],
        fileType: 'yaml' | 'toml',
        arrayItemLines: Set<number>
    ): CommentMetadata {
        const lineComments = new Map<number, CommentEntry[]>();
        const standaloneGroups: StandaloneCommentGroup[] = [];
        const pending: CommentEntry[] = [];
        const preamble: CommentEntry[] = [];
        const arrayDepthByLine = fileType === 'toml' ? this.buildTomlArrayDepthAtLineStart(lines) : undefined;
        let pendingLine = -1;
        let pendingFromArray = false;
        let pendingIndent = -1;
        let preambleLine = -1;
        let hasBoundNode = false;

        const flushPreamble = (): void => {
            if (preamble.length === 0 || preambleLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, preambleLine, preamble);
            preamble.length = 0;
            preambleLine = -1;
        };

        const flushPendingStandalone = (rootOnly = false): void => {
            if (pending.length === 0 || pendingLine < 0) {
                return;
            }
            this.pushStandaloneGroup(standaloneGroups, pendingLine, pending, rootOnly);
            pending.length = 0;
            pendingLine = -1;
            pendingFromArray = false;
            pendingIndent = -1;
        };

        const pushCommentForCurrentContext = (text: string, line: number, indent: number, arrayDepth: number): void => {
            if (!text) {
                return;
            }

            if (!hasBoundNode) {
                if (preamble.length === 0) {
                    preambleLine = line;
                }
                this.pushComment(preamble, '#', text);
                return;
            }

            if (pending.length === 0) {
                pendingLine = line;
                pendingIndent = indent;
                pendingFromArray = fileType === 'yaml'
                    ? this.inferYamlPendingFromArray(lines, line, arrayItemLines)
                    : arrayDepth > 0;
            }
            this.pushComment(pending, '#', text);
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const keyExists = this.extractKeysFromLine(line, fileType).length > 0;
            const arrayItemExists = arrayItemLines.has(i);
            const commentOnlyMatch = line.match(/^\s*#(.*)$/);
            const inlineComments = this.findHashInlineComments(line);
            const bindableLine = keyExists || arrayItemExists;
            const currentIndent = this.getIndentation(line);
            const currentArrayDepth = arrayDepthByLine ? (arrayDepthByLine[i] ?? 0) : 0;

            if (commentOnlyMatch) {
                const text = this.cleanCommentText(commentOnlyMatch[1]);
                if (text) {
                    if (fileType === 'yaml' && pending.length > 0 && currentIndent < pendingIndent) {
                        flushPendingStandalone();
                    }

                    if (fileType === 'yaml' && hasBoundNode) {
                        const previousBindableLine = this.findYamlPreviousBindableLine(lines, i, arrayItemLines);
                        const nextBindableLine = this.findYamlNextBindableLine(lines, i, arrayItemLines);
                        const previousIndent = previousBindableLine >= 0 ? this.getIndentation(lines[previousBindableLine]) : -1;
                        const nextIndent = nextBindableLine >= 0 ? this.getIndentation(lines[nextBindableLine]) : -1;
                        const previousHasInlineValue = previousBindableLine >= 0
                            ? this.yamlLineHasInlineValue(lines[previousBindableLine])
                            : false;

                        const shouldFollowPrevious =
                            nextIndent >= 0 &&
                            currentIndent > nextIndent &&
                            previousIndent >= 0 &&
                            currentIndent > previousIndent &&
                            previousHasInlineValue;

                        if (shouldFollowPrevious) {
                            const existing = lineComments.get(previousBindableLine) ?? [];
                            this.pushComment(existing, '#', text);
                            lineComments.set(previousBindableLine, existing);
                            continue;
                        }
                    }

                    pushCommentForCurrentContext(text, i, currentIndent, currentArrayDepth);
                }
                continue;
            }

            if (!hasBoundNode && bindableLine) {
                flushPreamble();
            }

            if (bindableLine) {
                if (fileType === 'yaml' && pending.length > 0 && currentIndent < pendingIndent) {
                    flushPendingStandalone();
                }

                if (pending.length > 0 && pendingFromArray && !arrayItemExists) {
                    const escapedArrayContext = fileType === 'yaml'
                        ? currentIndent <= pendingIndent
                        : currentArrayDepth === 0;
                    if (escapedArrayContext) {
                        flushPendingStandalone();
                    }
                }

                const comments = [...pending, ...inlineComments].filter(comment => !!comment.text);
                if (comments.length > 0) {
                    lineComments.set(i, comments);
                }
                pending.length = 0;
                pendingLine = -1;
                pendingFromArray = false;
                pendingIndent = -1;
                hasBoundNode = true;
                continue;
            }

            if (!hasBoundNode && inlineComments.length > 0) {
                if (preamble.length === 0) {
                    preambleLine = i;
                }
                preamble.push(...inlineComments);
                continue;
            }

            if (pending.length > 0 && pendingFromArray) {
                const escapedArrayContext = fileType === 'yaml'
                    ? currentIndent <= pendingIndent && trimmed.length > 0
                    : currentArrayDepth === 0;
                if (escapedArrayContext) {
                    flushPendingStandalone();
                }
            }

            if (fileType === 'yaml' && pending.length > 0 && trimmed.length > 0 && currentIndent < pendingIndent) {
                flushPendingStandalone();
            }

            if (pending.length > 0 && pendingFromArray) {
                const stillInsideArrayContext = fileType === 'yaml'
                    ? currentIndent > pendingIndent || trimmed.length === 0
                    : currentArrayDepth > 0;
                if (stillInsideArrayContext) {
                    continue;
                }
            }

            if (fileType === 'yaml' && pending.length > 0 && (trimmed.length === 0 || currentIndent >= pendingIndent)) {
                continue;
            }

            if (trimmed.length === 0) {
                continue;
            }

            pending.length = 0;
            pendingLine = -1;
            pendingFromArray = false;
            pendingIndent = -1;

            if (!hasBoundNode) {
                flushPreamble();
            }
        }

        flushPreamble();
        flushPendingStandalone(true);

        return { lineComments, standaloneGroups };
    }

    /**
     * 向目标集合追加注释
     * @param target - target 参数
     * @param marker - marker 参数
     * @param text - text 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private static pushComment(target: CommentEntry[], marker: CommentMarker, text: string): void {
        if (!text) {
            return;
        }
        target.push({ marker, text });
    }

    /**
     * 查找JSON 行内注释集合并返回匹配结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findJsonInlineComments(line: string): CommentEntry[] {
        const comments: CommentEntry[] = [];
        let inString = false;
        let escape = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = i + 1 < line.length ? line[i + 1] : '';

            if (inString) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === '/' && next === '/') {
                const text = this.cleanCommentText(line.slice(i + 2));
                if (text) {
                    comments.push({ marker: '/', text });
                }
                break;
            }
            if (ch === '/' && next === '*') {
                const end = line.indexOf('*/', i + 2);
                const raw = end >= 0 ? line.slice(i + 2, end) : line.slice(i + 2);
                const text = this.cleanCommentText(raw);
                if (text) {
                    comments.push({ marker: '*', text });
                }
                if (end < 0) {
                    break;
                }
                i = end + 1;
            }
        }

        return comments;
    }

    /**
     * 查找井号行内注释集合并返回匹配结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findHashInlineComments(line: string): CommentEntry[] {
        const codePart = this.stripHashCommentText(line);
        if (codePart.length === line.length) {
            return [];
        }

        const rawComment = line.slice(codePart.length + 1);
        const text = this.cleanCommentText(rawComment);
        return text ? [{ marker: '#', text }] : [];
    }

    /**
     * 扫描XML行注释集合并提取片段
     * @param line - line 参数
     * @param state - state 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static scanXmlLineComments(line: string, state: XmlCommentScanState): XmlLineCommentScanResult {
        const comments: string[] = [];
        let nonCommentText = '';
        let cursor = 0;

        while (cursor < line.length) {
            if (state.inComment) {
                const end = line.indexOf('-->', cursor);
                if (end < 0) {
                    state.parts.push(line.slice(cursor));
                    cursor = line.length;
                    break;
                }

                state.parts.push(line.slice(cursor, end));
                const text = this.cleanXmlCommentText(state.parts.join('\n'));
                if (text) {
                    comments.push(text);
                }

                state.inComment = false;
                state.parts = [];
                cursor = end + 3;
                continue;
            }

            const start = line.indexOf('<!--', cursor);
            if (start < 0) {
                nonCommentText += line.slice(cursor);
                break;
            }

            nonCommentText += line.slice(cursor, start);
            cursor = start + 4;

            const end = line.indexOf('-->', cursor);
            if (end < 0) {
                state.inComment = true;
                state.parts = [line.slice(cursor)];
                break;
            }

            const text = this.cleanXmlCommentText(line.slice(cursor, end));
            if (text) {
                comments.push(text);
            }

            cursor = end + 3;
        }

        return {
            nonCommentText,
            comments,
        };
    }

    /**
     * 去除井号注释文本以保留有效信息
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static stripHashCommentText(line: string): string {
        let inSingle = false;
        let inDouble = false;
        let escape = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (inDouble) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inDouble = false;
                }
                continue;
            }

            if (inSingle) {
                if (ch === '\'') {
                    inSingle = false;
                }
                continue;
            }

            if (ch === '"') {
                inDouble = true;
                continue;
            }
            if (ch === '\'') {
                inSingle = true;
                continue;
            }

            if (ch === '#') {
                return line.slice(0, i);
            }
        }

        return line;
    }

    /**
     * 构建JSON 数组起始行深度供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildJsonArrayDepthAtLineStart(lines: string[]): number[] {
        const sanitizedLines = this.stripJsoncComments(lines.join('\n')).split('\n');
        const depthAtLineStart: number[] = [];
        let arrayDepth = 0;

        for (let i = 0; i < sanitizedLines.length; i++) {
            const line = sanitizedLines[i];
            depthAtLineStart.push(arrayDepth);

            let inString = false;
            let escape = false;
            for (let j = 0; j < line.length; j++) {
                const ch = line[j];

                if (inString) {
                    if (escape) {
                        escape = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escape = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    continue;
                }
                if (ch === '[') {
                    arrayDepth += 1;
                    continue;
                }
                if (ch === ']') {
                    arrayDepth = Math.max(0, arrayDepth - 1);
                }
            }
        }

        return depthAtLineStart;
    }

    /**
     * 构建JSON 对象起始行深度供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildJsonObjectDepthAtLineStart(lines: string[]): number[] {
        const sanitizedLines = this.stripJsoncComments(lines.join('\n')).split('\n');
        const depthAtLineStart: number[] = [];
        let objectDepth = 0;

        for (let i = 0; i < sanitizedLines.length; i++) {
            const line = sanitizedLines[i];
            depthAtLineStart.push(objectDepth);

            let inString = false;
            let escape = false;
            for (let j = 0; j < line.length; j++) {
                const ch = line[j];

                if (inString) {
                    if (escape) {
                        escape = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escape = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    continue;
                }
                if (ch === '{') {
                    objectDepth += 1;
                    continue;
                }
                if (ch === '}') {
                    objectDepth = Math.max(0, objectDepth - 1);
                }
            }
        }

        return depthAtLineStart;
    }

    /**
     * 统计XML 元素深度增量用于流程判断
     * @param nonCommentText - nonCommentText 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static countXmlElementDepthDelta(nonCommentText: string): number {
        let delta = 0;
        const pattern = /<\s*(\/)?\s*([A-Za-z_:][\w:.-]*)([^<>]*?)>/g;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(nonCommentText)) !== null) {
            const raw = match[0];
            const isClosing = Boolean(match[1]);
            const isSelfClosing = !isClosing && /\/\s*>$/.test(raw);

            if (isClosing) {
                delta -= 1;
                continue;
            }

            if (!isSelfClosing) {
                delta += 1;
            }
        }

        return delta;
    }

    /**
     * 构建TOML 数组起始行深度供后续流程复用
     * @param lines - lines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static buildTomlArrayDepthAtLineStart(lines: string[]): number[] {
        const depthAtLineStart: number[] = [];
        let arrayDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            depthAtLineStart.push(arrayDepth);
            const codeLine = this.stripHashCommentText(lines[i]);

            if (arrayDepth > 0) {
                arrayDepth += this.countSquareBracketDelta(codeLine);
                if (arrayDepth < 0) {
                    arrayDepth = 0;
                }
                continue;
            }

            const trimmed = codeLine.trim();
            if (trimmed.length === 0 || /^\s*\[\[.*\]\]\s*$/.test(trimmed) || /^\s*\[.*\]\s*$/.test(trimmed)) {
                continue;
            }

            const equalIndex = codeLine.indexOf('=');
            if (equalIndex < 0) {
                continue;
            }

            const rhs = codeLine.slice(equalIndex + 1);
            const arrayStart = this.findTomlArrayStart(rhs);
            if (arrayStart < 0) {
                continue;
            }

            arrayDepth = this.countSquareBracketDelta(rhs.slice(arrayStart));
            if (arrayDepth < 0) {
                arrayDepth = 0;
            }
        }

        return depthAtLineStart;
    }

    /**
     * 根据上下文推断YAML 待绑定数组
     * @param lines - lines 参数
     * @param lineIndex - lineIndex 参数
     * @param arrayItemLines - arrayItemLines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static inferYamlPendingFromArray(lines: string[], lineIndex: number, arrayItemLines: Set<number>): boolean {
        for (let i = lineIndex - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            if (trimmed.length === 0 || /^#/.test(trimmed)) {
                continue;
            }

            if (arrayItemLines.has(i)) {
                return true;
            }

            if (this.extractYamlKeys(lines[i]).length > 0) {
                return false;
            }

            return false;
        }

        return false;
    }

    /**
     * 查找YAML 前一个可绑定行并返回匹配结果
     * @param lines - lines 参数
     * @param lineIndex - lineIndex 参数
     * @param arrayItemLines - arrayItemLines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findYamlPreviousBindableLine(lines: string[], lineIndex: number, arrayItemLines: Set<number>): number {
        for (let i = lineIndex - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            if (trimmed.length === 0 || /^#/.test(trimmed)) {
                continue;
            }

            if (arrayItemLines.has(i) || this.extractYamlKeys(lines[i]).length > 0) {
                return i;
            }
        }

        return -1;
    }

    /**
     * 查找YAML 下一个可绑定行并返回匹配结果
     * @param lines - lines 参数
     * @param lineIndex - lineIndex 参数
     * @param arrayItemLines - arrayItemLines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static findYamlNextBindableLine(lines: string[], lineIndex: number, arrayItemLines: Set<number>): number {
        for (let i = lineIndex + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.length === 0 || /^#/.test(trimmed)) {
                continue;
            }

            if (arrayItemLines.has(i) || this.extractYamlKeys(lines[i]).length > 0) {
                return i;
            }
        }

        return -1;
    }

    /**
     * 处理行内注释标记值相关逻辑并返回结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static yamlLineHasInlineValue(line: string): boolean {
        const code = this.stripHashCommentText(line).trim();
        if (code.length === 0) {
            return false;
        }

        const withoutArrayPrefix = code.replace(/^-\s+/, '');
        const colonIndex = withoutArrayPrefix.indexOf(':');
        if (colonIndex < 0) {
            return false;
        }

        const rhs = withoutArrayPrefix.slice(colonIndex + 1).trim();
        return rhs.length > 0;
    }

    /**
     * 获取缩进并返回结果
     * @param line - line 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static getIndentation(line: string): number {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
    }

    /**
     * 处理 pushStandaloneGroup 相关逻辑
     * @param groups - 参数
     * @param line - 参数
     * @param comments - 参数
     * @param rootOnly - 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private static pushStandaloneGroup(
        groups: StandaloneCommentGroup[],
        line: number,
        comments: CommentEntry[],
        rootOnly = false
    ): void {
        if (comments.length === 0) {
            return;
        }

        groups.push({
            line,
            comments: [...comments],
            rootOnly,
        });
    }

    /**
     * 处理注释文本相关逻辑并返回结果
     * @param text - text 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static cleanCommentText(text: string): string {
        return text
            .split('\n')
            .map(line => line.trim().replace(/^\*+\s?/, ''))
            .join('\n')
            .trim();
    }

    /**
     * 处理XML注释文本相关逻辑并返回结果
     * @param text - text 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static cleanXmlCommentText(text: string): string {
        return text
            .split('\n')
            .map(line => line.replace(/\r/g, '').trim())
            .join('\n')
            .trim();
    }

    /**
     * 渲染注释图标并返回可展示内容
     * @param comments - comments 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderCommentIcon(comments: CommentEntry[]): string {
        const encodedComments = escapeHtml(JSON.stringify(comments));
        const ariaLabel = escapeHtml(comments.map(comment => `${comment.marker} ${comment.text}`).join('\n')).replace(/\n/g, '&#10;');
        return `<span class="tree-comment-icon codicon codicon-note" data-comments="${encodedComments}" aria-label="${ariaLabel}" tabindex="0"></span>`;
    }

    /**
     * 渲染注释指定行图标并返回可展示内容
     * @param line - line 参数
     * @param commentLines - commentLines 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderCommentIconForLine(line: number, commentLines: CommentLineIndex): string {
        if (line < 0 || !commentLines.has(line)) {
            return '';
        }
        return this.renderCommentIcon(commentLines.get(line) as CommentEntry[]);
    }

    /**
     * 处理 renderCommentIconForEntry 相关逻辑
     * @param line - 参数
     * @param commentLines - 参数
     * @param fileType - 参数
     * @param entryKey - 参数
     * @param sourceLines - 参数
     * @param xmlConsumedLines - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderCommentIconForEntry(
        line: number,
        commentLines: CommentLineIndex,
        fileType: FileType,
        entryKey: string | null,
        sourceLines: string[],
        xmlConsumedLines: Set<number> | null
    ): string {
        if (line < 0 || !commentLines.has(line)) {
            return '';
        }

        if (
            entryKey === null &&
            (fileType === 'yaml' || fileType === 'toml') &&
            line < sourceLines.length &&
            this.extractKeysFromLine(sourceLines[line], fileType).length > 0
        ) {
            return '';
        }

        if (fileType !== 'xml') {
            return this.renderCommentIcon(commentLines.get(line) as CommentEntry[]);
        }

        if (entryKey === null) {
            if (!xmlConsumedLines || xmlConsumedLines.has(line)) {
                return '';
            }

            xmlConsumedLines.add(line);
            return this.renderCommentIcon(commentLines.get(line) as CommentEntry[]);
        }

        if (this.isXmlAttributeKey(entryKey)) {
            return '';
        }

        if (!xmlConsumedLines || xmlConsumedLines.has(line)) {
            return '';
        }

        xmlConsumedLines.add(line);
        return this.renderCommentIcon(commentLines.get(line) as CommentEntry[]);
    }

    /**
     * 创建独立注释游标并返回可复用实例
     * @param groups - groups 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static createStandaloneCursor(groups: StandaloneCommentGroup[]): StandaloneCommentCursor {
        const sortedGroups = [...groups].sort((a, b) => a.line - b.line);
        return {
            groups: sortedGroups,
            index: 0,
        };
    }

    /**
     * 处理 renderStandaloneBeforeBoundary 相关逻辑
     * @param cursor - 参数
     * @param boundaryExclusive - 参数
     * @param includeRootOnly - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderStandaloneBeforeBoundary(
        cursor: StandaloneCommentCursor,
        boundaryExclusive: number,
        includeRootOnly: boolean
    ): string {
        let html = '';
        while (cursor.index < cursor.groups.length && cursor.groups[cursor.index].line < boundaryExclusive) {
            const group = cursor.groups[cursor.index];
            if (group.rootOnly && !includeRootOnly) {
                break;
            }
            html += `<div class="tree-item tree-standalone-comment">${this.renderCommentIcon(group.comments)}</div>`;
            cursor.index += 1;
        }
        return html;
    }

    /**
     * 解析边界行并返回最终结果
     * @param line - line 参数
     * @param fallback - fallback 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static resolveBoundaryLine(line: number, fallback: number): number {
        return line >= 0 ? line : fallback;
    }

    /**
     * 处理 constrainBoundaryForJsonContainer 相关逻辑
     * @param fileType - 参数
     * @param line - 参数
     * @param boundaryExclusive - 参数
     * @param jsonCloseLineLocator - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static constrainBoundaryForJsonContainer(
        fileType: FileType,
        line: number,
        boundaryExclusive: number,
        jsonCloseLineLocator: JsonCloseLineLocator | null
    ): number {
        if (fileType !== 'json' || !jsonCloseLineLocator || line < 0) {
            return boundaryExclusive;
        }

        const closeLine = jsonCloseLineLocator.next(line);
        if (closeLine < 0) {
            return boundaryExclusive;
        }

        return Math.min(boundaryExclusive, closeLine + 1);
    }

    /**
     * 处理 constrainBoundaryForYamlContainer 相关逻辑
     * @param fileType - 参数
     * @param line - 参数
     * @param boundaryExclusive - 参数
     * @param yamlCloseLineLocator - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static constrainBoundaryForYamlContainer(
        fileType: FileType,
        line: number,
        boundaryExclusive: number,
        yamlCloseLineLocator: YamlCloseLineLocator | null
    ): number {
        if (fileType !== 'yaml' || !yamlCloseLineLocator || line < 0) {
            return boundaryExclusive;
        }

        const closeLine = yamlCloseLineLocator.next(line);
        if (closeLine < 0) {
            return boundaryExclusive;
        }

        return Math.min(boundaryExclusive, closeLine);
    }

    /**
     * 处理 constrainBoundaryForXmlContainer 相关逻辑
     * @param fileType - 参数
     * @param line - 参数
     * @param boundaryExclusive - 参数
     * @param xmlCloseLineLocator - 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static constrainBoundaryForXmlContainer(
        fileType: FileType,
        line: number,
        boundaryExclusive: number,
        xmlCloseLineLocator: XmlCloseLineLocator | null
    ): number {
        if (fileType !== 'xml' || !xmlCloseLineLocator || line < 0) {
            return boundaryExclusive;
        }

        const closeLine = xmlCloseLineLocator.next(line);
        if (closeLine < 0) {
            return boundaryExclusive;
        }

        return Math.min(boundaryExclusive, closeLine + 1);
    }

    /**
     * 判断值是否为复合类型（对象或非空数组）
     * @param data - data 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static isCompound(data: unknown): boolean {
        if (data === null || data === undefined || data instanceof Date) {
            return false;
        }
        if (Array.isArray(data)) {
            return data.length > 0;
        }
        if (typeof data === 'object') {
            return Object.keys(data as Record<string, unknown>).length > 0;
        }
        return false;
    }

    /**
     * 渲染复合值的子节点
     * @param data - data 参数
     * @param lineLocator - lineLocator 参数
     * @param arrayItemLineLocator - arrayItemLineLocator 参数
     * @param commentLines - commentLines 参数
     * @param standaloneCursor - standaloneCursor 参数
     * @param boundaryExclusive - boundaryExclusive 参数
     * @param fileType - fileType 参数
     * @param sourceLines - sourceLines 参数
     * @param jsonCloseLineLocator - jsonCloseLineLocator 参数
     * @param yamlCloseLineLocator - yamlCloseLineLocator 参数
     * @param xmlCloseLineLocator - xmlCloseLineLocator 参数
     * @param xmlConsumedLines - xmlConsumedLines 参数
     * @param parentPath - parentPath 参数
     * @param xmlDeferredFirstItemComments - xmlDeferredFirstItemComments 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderCompoundChildren(
        data: unknown,
        lineLocator: KeyLineLocator,
        arrayItemLineLocator: ArrayItemLineLocator,
        commentLines: CommentLineIndex,
        standaloneCursor: StandaloneCommentCursor,
        boundaryExclusive: number,
        fileType: FileType,
        sourceLines: string[],
        jsonCloseLineLocator: JsonCloseLineLocator | null,
        yamlCloseLineLocator: YamlCloseLineLocator | null,
        xmlCloseLineLocator: XmlCloseLineLocator | null,
        xmlConsumedLines: Set<number> | null,
        parentPath: string[],
        xmlDeferredFirstItemComments: CommentEntry[] | null = null
    ): string {
        let html = '<div class="tree-children">';
        if (Array.isArray(data)) {
            const items = data.map(item => ({
                value: item,
                line: arrayItemLineLocator.next(),
            }));

            for (let i = 0; i < items.length; i++) {
                const itemInfo = items[i];
                const line = itemInfo.line;
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const deferredXmlIcon =
                    fileType === 'xml'
                    && i === 0
                    && xmlDeferredFirstItemComments
                    && xmlDeferredFirstItemComments.length > 0
                        ? this.renderCommentIcon(xmlDeferredFirstItemComments)
                        : '';
                const commentIcon = deferredXmlIcon || this.renderCommentIconForEntry(line, commentLines, fileType, null, sourceLines, xmlConsumedLines);
                const itemBoundary = this.resolveBoundaryLine(line, boundaryExclusive);
                const nextBoundary = i + 1 < items.length
                    ? this.resolveBoundaryLine(items[i + 1].line, boundaryExclusive)
                    : boundaryExclusive;

                html += this.renderStandaloneBeforeBoundary(standaloneCursor, itemBoundary, false);

                if (this.isCompound(itemInfo.value)) {
                    const bracket = Array.isArray(itemInfo.value)
                        ? `[${itemInfo.value.length}]`
                        : `{${Object.keys(itemInfo.value as Record<string, unknown>).length}}`;
                    let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, nextBoundary, jsonCloseLineLocator);
                    childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                    childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                    html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(itemInfo.value, lineLocator, arrayItemLineLocator, commentLines, standaloneCursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, parentPath, null)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: ${this.renderPrimitive(itemInfo.value)}</div>`;
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            const entries = Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
                key,
                value,
                line: lineLocator.next(key, parentPath),
            }));

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const line = entry.line;
                const entryPath = [...parentPath, entry.key];
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const shouldDeferXmlArrayLineComment =
                    fileType === 'xml'
                    && Array.isArray(entry.value)
                    && line >= 0
                    && commentLines.has(line)
                    && !this.isXmlAttributeKey(entry.key);
                const deferredXmlArrayComments = shouldDeferXmlArrayLineComment
                    ? [...(commentLines.get(line) as CommentEntry[])]
                    : null;
                if (shouldDeferXmlArrayLineComment && xmlConsumedLines) {
                    xmlConsumedLines.add(line);
                }
                const commentIcon = shouldDeferXmlArrayLineComment
                    ? ''
                    : this.renderCommentIconForEntry(line, commentLines, fileType, entry.key, sourceLines, xmlConsumedLines);
                const itemBoundary = this.resolveBoundaryLine(line, boundaryExclusive);
                const nextBoundary = i + 1 < entries.length
                    ? this.resolveBoundaryLine(entries[i + 1].line, boundaryExclusive)
                    : boundaryExclusive;

                html += this.renderStandaloneBeforeBoundary(standaloneCursor, itemBoundary, false);

                if (this.isCompound(entry.value)) {
                    const bracket = Array.isArray(entry.value)
                        ? `[${entry.value.length}]`
                        : `{${Object.keys(entry.value as Record<string, unknown>).length}}`;
                    let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, nextBoundary, jsonCloseLineLocator);
                    childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                    childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                    html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(entry.value, lineLocator, arrayItemLineLocator, commentLines, standaloneCursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, entryPath, Array.isArray(entry.value) ? deferredXmlArrayComments : null)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: ${this.renderPrimitive(entry.value)}</div>`;
                }
            }
        }

        html += this.renderStandaloneBeforeBoundary(standaloneCursor, boundaryExclusive, false);
        html += '</div>';
        return html;
    }

    /**
     * 渲染原始值
     * @param data - data 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderPrimitive(data: unknown): string {
        if (data === null || data === undefined) {
            return `<span class="tree-value tree-null">null</span>`;
        }
        if (data instanceof Date) {
            return `<span class="tree-value tree-string">"${escapeHtml(data.toISOString())}"</span>`;
        }
        if (typeof data === 'string') {
            return `<span class="tree-value tree-string">"${escapeHtml(data)}"</span>`;
        }
        if (typeof data === 'number') {
            return `<span class="tree-value tree-number">${data}</span>`;
        }
        if (typeof data === 'boolean') {
            return `<span class="tree-value tree-boolean">${data}</span>`;
        }
        if (Array.isArray(data) && data.length === 0) {
            return `<span class="tree-value tree-empty">[]</span>`;
        }
        if (typeof data === 'object' && Object.keys(data as Record<string, unknown>).length === 0) {
            return `<span class="tree-value tree-empty">{}</span>`;
        }
        return `<span class="tree-value">${escapeHtml(String(data))}</span>`;
    }

    /**
     * 递归渲染树形结构（入口：顶层对象/数组)
     * @param data - data 参数
     * @param lineLocator - lineLocator 参数
     * @param arrayItemLineLocator - arrayItemLineLocator 参数
     * @param commentLines - commentLines 参数
     * @param standaloneGroups - standaloneGroups 参数
     * @param fileType - fileType 参数
     * @param sourceLines - sourceLines 参数
     * @param jsonCloseLineLocator - jsonCloseLineLocator 参数
     * @param yamlCloseLineLocator - yamlCloseLineLocator 参数
     * @param xmlCloseLineLocator - xmlCloseLineLocator 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private static renderTree(
        data: unknown,
        lineLocator: KeyLineLocator,
        arrayItemLineLocator: ArrayItemLineLocator,
        commentLines: CommentLineIndex,
        standaloneGroups: StandaloneCommentGroup[],
        fileType: FileType,
        sourceLines: string[],
        jsonCloseLineLocator: JsonCloseLineLocator | null,
        yamlCloseLineLocator: YamlCloseLineLocator | null,
        xmlCloseLineLocator: XmlCloseLineLocator | null
    ): string {
        const cursor = this.createStandaloneCursor(standaloneGroups);
        const xmlConsumedLines = fileType === 'xml' ? new Set<number>() : null;
        const rootBoundary = Number.POSITIVE_INFINITY;

        if (!this.isCompound(data)) {
            let html = this.renderStandaloneBeforeBoundary(cursor, rootBoundary, true);
            html += this.renderPrimitive(data);
            html += this.renderStandaloneBeforeBoundary(cursor, rootBoundary, true);
            return html;
        }

        let html = '';
        if (Array.isArray(data)) {
            const yamlDocumentRootLines = (fileType === 'yaml' && this.shouldUseYamlDocumentArrayLines(data, sourceLines))
                ? this.findYamlDocumentStartLines(sourceLines)
                : null;
            const isYamlDocumentRootArray = fileType === 'yaml' && yamlDocumentRootLines !== null;
            const items = data.map((item, index) => ({
                value: item,
                line: (yamlDocumentRootLines && index < yamlDocumentRootLines.length)
                    ? yamlDocumentRootLines[index]
                    : arrayItemLineLocator.next(),
            }));

            for (let i = 0; i < items.length; i++) {
                const itemInfo = items[i];
                const line = itemInfo.line;
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const commentIcon = this.renderCommentIconForEntry(line, commentLines, fileType, null, sourceLines, xmlConsumedLines);
                const itemBoundary = this.resolveBoundaryLine(line, rootBoundary);
                const nextBoundary = i + 1 < items.length
                    ? this.resolveBoundaryLine(items[i + 1].line, rootBoundary)
                    : rootBoundary;

                html += this.renderStandaloneBeforeBoundary(cursor, itemBoundary, true);

                if (this.isCompound(itemInfo.value)) {
                    const bracket = Array.isArray(itemInfo.value)
                        ? `[${itemInfo.value.length}]`
                        : `{${Object.keys(itemInfo.value as Record<string, unknown>).length}}`;
                    let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, nextBoundary, jsonCloseLineLocator);
                    if (!isYamlDocumentRootArray) {
                        childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                    }
                    childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                    html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(itemInfo.value, lineLocator, arrayItemLineLocator, commentLines, cursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, [], null)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: ${this.renderPrimitive(itemInfo.value)}</div>`;
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            const entries = Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
                key,
                value,
                line: lineLocator.next(key, []),
            }));

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const line = entry.line;
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const shouldDeferXmlArrayLineComment =
                    fileType === 'xml'
                    && Array.isArray(entry.value)
                    && line >= 0
                    && commentLines.has(line)
                    && !this.isXmlAttributeKey(entry.key);
                const deferredXmlArrayComments = shouldDeferXmlArrayLineComment
                    ? [...(commentLines.get(line) as CommentEntry[])]
                    : null;
                if (shouldDeferXmlArrayLineComment && xmlConsumedLines) {
                    xmlConsumedLines.add(line);
                }
                const commentIcon = shouldDeferXmlArrayLineComment
                    ? ''
                    : this.renderCommentIconForEntry(line, commentLines, fileType, entry.key, sourceLines, xmlConsumedLines);
                const itemBoundary = this.resolveBoundaryLine(line, rootBoundary);
                const nextBoundary = i + 1 < entries.length
                    ? this.resolveBoundaryLine(entries[i + 1].line, rootBoundary)
                    : rootBoundary;

                html += this.renderStandaloneBeforeBoundary(cursor, itemBoundary, true);

                if (this.isCompound(entry.value)) {
                    const bracket = Array.isArray(entry.value)
                        ? `[${entry.value.length}]`
                        : `{${Object.keys(entry.value as Record<string, unknown>).length}}`;
                    let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, nextBoundary, jsonCloseLineLocator);
                    childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                    childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                    html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(entry.value, lineLocator, arrayItemLineLocator, commentLines, cursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, [entry.key], Array.isArray(entry.value) ? deferredXmlArrayComments : null)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: ${this.renderPrimitive(entry.value)}</div>`;
                }
            }
        }

        html += this.renderStandaloneBeforeBoundary(cursor, rootBoundary, true);
        return html;
    }
}
