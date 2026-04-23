import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { FileType, PreviewResult } from './fileTypes';
import { escapeHtml, escapeRegex } from './utils';

interface KeyLineLocator {
    next(key: string): number;
}

interface ArrayItemLineLocator {
    next(): number;
}

type CommentLineIndex = Map<number, string>;

interface CommentMetadata {
    lineComments: CommentLineIndex;
    topLevelComments: string[];
}

export class CodePreviewProvider {
    private static readonly MAX_HTML_LENGTH = 10 * 1024 * 1024;

    /**
     * 解析数据文件内容，返回树形结构的 HTML
     */
    static parse(content: string, fileType: FileType): PreviewResult {
        try {
            const parsed = this.parseContent(content, fileType);
            const lines = content.split('\n');
            const commentMetadata = this.buildCommentMetadata(lines, fileType);
            const lineLocator = this.createKeyLineLocator(lines, fileType);
            const arrayItemLineLocator = this.createArrayItemLineLocator(lines, fileType);
            const html = this.renderTree(
                parsed,
                lineLocator,
                arrayItemLineLocator,
                commentMetadata.lineComments,
                commentMetadata.topLevelComments
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
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    private static createKeyLineLocator(lines: string[], fileType: FileType): KeyLineLocator {
        const primaryIndex = this.buildPrimaryKeyLineIndex(lines, fileType);
        const primaryCursor = new Map<string, number>();

        // 对少数主索引未覆盖的 key 做按需兜底，避免极端格式丢定位
        const fallbackIndex = new Map<string, number[]>();
        const fallbackCursor = new Map<string, number>();

        return {
            next: (key: string): number => {
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

    private static createArrayItemLineLocator(lines: string[], fileType: FileType): ArrayItemLineLocator {
        const itemLines = this.buildArrayItemLineIndex(lines, fileType);
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

    private static buildArrayItemLineIndex(lines: string[], fileType: FileType): number[] {
        switch (fileType) {
            case 'json':
                return this.buildJsonArrayItemLineIndex(lines);
            case 'yaml':
                return this.buildYamlArrayItemLineIndex(lines);
            case 'toml':
                return this.buildTomlArrayItemLineIndex(lines);
            default:
                return [];
        }
    }

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

    private static isJsonArrayValueStart(token: string | null): boolean {
        if (!token) {
            return false;
        }

        if (token === '{' || token === '[' || token === '"' || token === '-' || token === 't' || token === 'f' || token === 'n') {
            return true;
        }

        return /[0-9]/.test(token);
    }

    private static buildYamlArrayItemLineIndex(lines: string[]): number[] {
        const result: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.length === 0 || trimmed.startsWith('#')) {
                continue;
            }
            if (/^-\s+/.test(trimmed) || trimmed === '-') {
                result.push(i);
            }
        }

        return result;
    }

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

    private static parseJsonOrJsonc(content: string): unknown {
        try {
            return JSON.parse(content);
        } catch (_error) {
            return JSON.parse(this.sanitizeJsonc(content));
        }
    }

    private static sanitizeJsonc(content: string): string {
        const withoutComments = this.stripJsoncComments(content);
        return this.stripJsonTrailingCommas(withoutComments);
    }

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

    private static buildPrimaryKeyLineIndex(lines: string[], fileType: FileType): Map<string, number[]> {
        const index = new Map<string, number[]>();

        for (let i = 0; i < lines.length; i++) {
            const keys = this.extractKeysFromLine(lines[i], fileType);
            for (const key of keys) {
                this.pushIndexedLine(index, key, i);
            }
        }

        return index;
    }

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

    private static extractKeysFromLine(line: string, fileType: FileType): string[] {
        switch (fileType) {
            case 'json':
                return this.extractJsonKeys(line);
            case 'yaml':
                return this.extractYamlKeys(line);
            case 'toml':
                return this.extractTomlKeys(line);
            default:
                return [];
        }
    }

    private static extractJsonKeys(line: string): string[] {
        const match = line.match(/^\s*"((?:\\.|[^"\\])*)"\s*(?:(?:\/\*.*?\*\/)\s*)*:/);
        if (!match) {
            return [];
        }
        return [this.decodeJsonString(match[1])];
    }

    private static extractYamlKeys(line: string): string[] {
        const match = line.match(/^\s*(?:-\s+)?(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^:#][^:]*?))\s*:(?:\s|$)/);
        if (!match) {
            return [];
        }

        const key = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        return key ? [key] : [];
    }

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

    private static splitTomlPath(pathExpr: string): string[] {
        return pathExpr
            .split('.')
            .map(segment => segment.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean);
    }

    private static decodeJsonString(raw: string): string {
        try {
            return JSON.parse(`"${raw}"`) as string;
        } catch (_error) {
            return raw;
        }
    }

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

    private static buildCommentMetadata(lines: string[], fileType: FileType): CommentMetadata {
        const arrayItemLines = new Set(this.buildArrayItemLineIndex(lines, fileType));

        switch (fileType) {
            case 'json':
                return this.buildJsonCommentMetadata(lines, arrayItemLines);
            case 'yaml':
                return this.buildHashCommentMetadata(lines, 'yaml', arrayItemLines);
            case 'toml':
                return this.buildHashCommentMetadata(lines, 'toml', arrayItemLines);
            default:
                return {
                    lineComments: new Map<number, string>(),
                    topLevelComments: [],
                };
        }
    }

    private static buildJsonCommentMetadata(lines: string[], arrayItemLines: Set<number>): CommentMetadata {
        const lineComments = new Map<number, string>();
        const pending: string[] = [];
        const topLevelComments: string[] = [];
        let inBlockComment = false;
        let blockParts: string[] = [];
        let hasBoundNode = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const keyExists = this.extractJsonKeys(line).length > 0;
            const arrayItemExists = arrayItemLines.has(i);
            const inlineComments = this.findJsonInlineComments(line);

            if (inBlockComment) {
                const end = line.indexOf('*/');
                if (end >= 0) {
                    blockParts.push(line.slice(0, end));
                    const merged = this.cleanCommentText(blockParts.join('\n'));
                    if (merged) {
                        this.appendComment(hasBoundNode ? pending : topLevelComments, merged);
                    }
                    blockParts = [];
                    inBlockComment = false;
                } else {
                    blockParts.push(line);
                    continue;
                }
            }

            if (/^\s*\/\//.test(line)) {
                const onlyComment = this.cleanCommentText(line.replace(/^\s*\/\//, ''));
                if (onlyComment) {
                    this.appendComment(hasBoundNode ? pending : topLevelComments, onlyComment);
                }
                continue;
            }

            if (/^\s*\/\*/.test(line)) {
                const singleLineBlock = line.match(/^\s*\/\*(.*?)\*\/\s*$/);
                if (singleLineBlock) {
                    const onlyComment = this.cleanCommentText(singleLineBlock[1]);
                    if (onlyComment) {
                        this.appendComment(hasBoundNode ? pending : topLevelComments, onlyComment);
                    }
                    continue;
                }

                const rest = line.replace(/^\s*\/\*/, '');
                const end = rest.indexOf('*/');
                if (end >= 0) {
                    const onlyComment = this.cleanCommentText(rest.slice(0, end));
                    if (onlyComment) {
                        this.appendComment(hasBoundNode ? pending : topLevelComments, onlyComment);
                    }
                    continue;
                }

                inBlockComment = true;
                blockParts = [rest];
                continue;
            }

            const bindableLine = keyExists || arrayItemExists;
            if (bindableLine) {
                const comments = [...pending, ...inlineComments].filter(Boolean);
                if (comments.length > 0) {
                    lineComments.set(i, comments.join('\n\n'));
                }
                pending.length = 0;
                hasBoundNode = true;
                continue;
            }

            if (!hasBoundNode && inlineComments.length > 0) {
                topLevelComments.push(...inlineComments);
            }

            if (trimmed.length === 0) {
                pending.length = 0;
                continue;
            }

            pending.length = 0;
        }

        return { lineComments, topLevelComments };
    }

    private static buildHashCommentMetadata(
        lines: string[],
        fileType: 'yaml' | 'toml',
        arrayItemLines: Set<number>
    ): CommentMetadata {
        const lineComments = new Map<number, string>();
        const pending: string[] = [];
        const topLevelComments: string[] = [];
        let hasBoundNode = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const keyExists = this.extractKeysFromLine(line, fileType).length > 0;
            const arrayItemExists = arrayItemLines.has(i);
            const commentOnlyMatch = line.match(/^\s*#(.*)$/);
            const inlineComments = this.findHashInlineComments(line);

            if (commentOnlyMatch) {
                const text = this.cleanCommentText(commentOnlyMatch[1]);
                if (text) {
                    this.appendComment(hasBoundNode ? pending : topLevelComments, text);
                }
                continue;
            }

            const bindableLine = keyExists || arrayItemExists;
            if (bindableLine) {
                const comments = [...pending, ...inlineComments].filter(Boolean);
                if (comments.length > 0) {
                    lineComments.set(i, comments.join('\n\n'));
                }
                pending.length = 0;
                hasBoundNode = true;
                continue;
            }

            if (!hasBoundNode && inlineComments.length > 0) {
                topLevelComments.push(...inlineComments);
            }

            if (trimmed.length === 0) {
                pending.length = 0;
                continue;
            }

            pending.length = 0;
        }

        return { lineComments, topLevelComments };
    }

    private static appendComment(target: string[], comment: string): void {
        if (!comment) {
            return;
        }
        target.push(comment);
    }

    private static findJsonInlineComments(line: string): string[] {
        const comments: string[] = [];
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
                    comments.push(text);
                }
                break;
            }
            if (ch === '/' && next === '*') {
                const end = line.indexOf('*/', i + 2);
                const raw = end >= 0 ? line.slice(i + 2, end) : line.slice(i + 2);
                const text = this.cleanCommentText(raw);
                if (text) {
                    comments.push(text);
                }
                if (end < 0) {
                    break;
                }
                i = end + 1;
            }
        }

        return comments;
    }

    private static findHashInlineComments(line: string): string[] {
        const codePart = this.stripHashCommentText(line);
        if (codePart.length === line.length) {
            return [];
        }

        const rawComment = line.slice(codePart.length + 1);
        const text = this.cleanCommentText(rawComment);
        return text ? [text] : [];
    }

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

    private static cleanCommentText(text: string): string {
        return text
            .split('\n')
            .map(line => line.trim().replace(/^\*+\s?/, ''))
            .join('\n')
            .trim();
    }

    private static renderCommentIcon(comment: string): string {
        const escapedComment = escapeHtml(comment).replace(/\n/g, '&#10;');
        return `<span class="tree-comment-icon codicon codicon-note" data-comment="${escapedComment}" aria-label="${escapedComment}" tabindex="0"></span>`;
    }

    private static renderCommentIconForLine(line: number, commentLines: CommentLineIndex): string {
        if (line < 0 || !commentLines.has(line)) {
            return '';
        }
        return this.renderCommentIcon(commentLines.get(line) as string);
    }

    private static renderTopLevelComments(comments: string[]): string {
        if (comments.length === 0) {
            return '';
        }

        return comments
            .map(comment => `<div class="tree-root-comment">${this.renderCommentIcon(comment)}</div>`)
            .join('');
    }

    /**
     * 判断值是否为复合类型（对象或非空数组）
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
     */
    private static renderCompoundChildren(
        data: unknown,
        lineLocator: KeyLineLocator,
        arrayItemLineLocator: ArrayItemLineLocator,
        commentLines: CommentLineIndex
    ): string {
        let html = '<div class="tree-children">';
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                const line = arrayItemLineLocator.next();
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const commentIcon = this.renderCommentIconForLine(line, commentLines);
                if (this.isCompound(item)) {
                    const bracket = Array.isArray(item) ? `[${item.length}]` : `{${Object.keys(item as Record<string, unknown>).length}}`;
                    html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${index}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(item, lineLocator, arrayItemLineLocator, commentLines)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${index}</span>${commentIcon}: ${this.renderPrimitive(item)}</div>`;
                }
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                const line = lineLocator.next(key);
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const commentIcon = this.renderCommentIconForLine(line, commentLines);
                if (this.isCompound(value)) {
                    const bracket = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value as Record<string, unknown>).length}}`;
                    html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(value, lineLocator, arrayItemLineLocator, commentLines)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-key"${lineAttr}>${escapeHtml(key)}</span>${commentIcon}: ${this.renderPrimitive(value)}</div>`;
                }
            }
        }
        html += '</div>';
        return html;
    }

    /**
     * 渲染原始值
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
     */
    private static renderTree(
        data: unknown,
        lineLocator: KeyLineLocator,
        arrayItemLineLocator: ArrayItemLineLocator,
        commentLines: CommentLineIndex,
        topLevelComments: string[]
    ): string {
        const topLevelHtml = this.renderTopLevelComments(topLevelComments);
        if (!this.isCompound(data)) {
            return topLevelHtml + this.renderPrimitive(data);
        }

        // 顶层直接渲染子节点（不包裹 details）
        let html = topLevelHtml;
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                const line = arrayItemLineLocator.next();
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const commentIcon = this.renderCommentIconForLine(line, commentLines);
                if (this.isCompound(item)) {
                    const bracket = Array.isArray(item) ? `[${item.length}]` : `{${Object.keys(item as Record<string, unknown>).length}}`;
                    html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${index}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(item, lineLocator, arrayItemLineLocator, commentLines)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${index}</span>${commentIcon}: ${this.renderPrimitive(item)}</div>`;
                }
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                const line = lineLocator.next(key);
                const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                const commentIcon = this.renderCommentIconForLine(line, commentLines);
                if (this.isCompound(value)) {
                    const bracket = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value as Record<string, unknown>).length}}`;
                    html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(value, lineLocator, arrayItemLineLocator, commentLines)}</details></div>`;
                } else {
                    html += `<div class="tree-item"><span class="tree-key"${lineAttr}>${escapeHtml(key)}</span>${commentIcon}: ${this.renderPrimitive(value)}</div>`;
                }
            }
        }
        return html;
    }
}
