import {
    ArrayItemLineLocator,
    CommentEntry,
    CommentMarker,
    CommentMetadata,
    JsonCloseLineLocator,
    StandaloneCommentGroup,
} from '../core/datatreeProviderTypes';
import { DatatreeTreeRenderBase } from '../common/datatreeTreeRenderBase';

/**
 * 提供 JSON 数据树能力
 */
export class DatatreeJsonFileTypeBase extends DatatreeTreeRenderBase {
    /**
         * 创建JSON 结束行定位器并返回可复用实例
         * @param lines - 按行拆分后的源文本
         * @returns 返回可复用实例
         */
        protected static createJsonCloseLineLocator(lines: string[]): JsonCloseLineLocator {
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
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findJsonCompoundStartInLine(line: string): { char: '{' | '['; column: number } | null {
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
         * 构建JSON数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildJsonArrayItemLineIndex(lines: string[]): number[] {
            const sanitizedLines = this.stripJsoncComments(lines.join('\n')).split('\n');
            const result: number[] = [];
            const stack: Array<{ kind: 'object' } | { kind: 'array'; expectingValue: boolean }> = [];

            for (let i = 0; i < sanitizedLines.length; i++) {
                const line = sanitizedLines[i];
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
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'array' && top.expectingValue) {
                            result.push(i);
                            top.expectingValue = false;
                        }

                        inString = true;
                        continue;
                    }

                    if (ch === '[') {
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'array' && top.expectingValue) {
                            result.push(i);
                            top.expectingValue = false;
                        }

                        stack.push({ kind: 'array', expectingValue: true });
                        continue;
                    }

                    if (ch === '{') {
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'array' && top.expectingValue) {
                            result.push(i);
                            top.expectingValue = false;
                        }

                        stack.push({ kind: 'object' });
                        continue;
                    }

                    if (ch === ',') {
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'array') {
                            top.expectingValue = true;
                        }
                        continue;
                    }

                    if (ch === ']') {
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'array') {
                            stack.pop();
                        }
                        continue;
                    }

                    if (ch === '}') {
                        const top = stack.length > 0 ? stack[stack.length - 1] : null;
                        if (top && top.kind === 'object') {
                            stack.pop();
                        }
                        continue;
                    }

                    if (/\s|:/.test(ch)) {
                        continue;
                    }

                    const top = stack.length > 0 ? stack[stack.length - 1] : null;
                    if (top && top.kind === 'array' && top.expectingValue && this.isJsonArrayValueStart(ch)) {
                        result.push(i);
                        top.expectingValue = false;
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
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findJsonLineFirstToken(line: string): string | null {
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
         * @param token - 解析阶段的 token 对象
         * @returns 返回布尔判断结果
         */
        protected static isJsonArrayValueStart(token: string | null): boolean {
            if (!token) {
                return false;
            }

            if (token === '{' || token === '[' || token === '"' || token === '-' || token === 't' || token === 'f' || token === 'n') {
                return true;
            }

            return /[0-9]/.test(token);
        }

    /**
         * 解析JSON 或 JSONC并返回结构化结果
         * @param content - 待解析的文件内容
         * @returns 返回结构化结果
         */
        protected static parseJsonOrJsonc(content: string): unknown {
            try {
                return JSON.parse(content);
            } catch (_error) {
                return JSON.parse(this.sanitizeJsonc(content));
            }
        }

    /**
         * 处理JSONC相关逻辑并返回结果
         * @param content - 待解析的文件内容
         * @returns 返回可被 JSON 解析器处理的标准文本
         */
        protected static sanitizeJsonc(content: string): string {
            const withoutComments = this.stripJsoncComments(content);
            return this.stripJsonTrailingCommas(withoutComments);
        }

    /**
         * 去除JSONC注释集合以保留有效信息
         * @param content - 待解析的文件内容
         * @returns 返回移除注释后的 JSON 文本
         */
        protected static stripJsoncComments(content: string): string {
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
         * @param content - 待解析的文件内容
         * @returns 返回移除尾随逗号后的 JSON 文本
         */
        protected static stripJsonTrailingCommas(content: string): string {
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
         * 提取JSON 键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 JSON 行中提取到的键名列表
         */
        protected static extractJsonKeys(line: string): string[] {
            const match = line.match(/^\s*(?:\/\*.*?\*\/\s*)*"((?:\\.|[^"\\])*)"\s*(?:(?:\/\*.*?\*\/)\s*)*:/);
            if (!match) {
                return [];
            }
            return [this.decodeJsonString(match[1])];
        }

    /**
         * 解码JSON 字符串并还原可读数据
         * @param raw - 未解码的原始字符串
         * @returns 返回解码后的字符串内容
         */
        protected static decodeJsonString(raw: string): string {
            try {
                return JSON.parse(`"${raw}"`) as string;
            } catch (_error) {
                return raw;
            }
        }

    /**
         * 构建JSON注释元数据供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @param arrayItemLines - 数组元素对应的行号集合
         * @returns 返回构建后的数据结构
         */
        protected static buildJsonCommentMetadata(lines: string[], arrayItemLines: Set<number>): CommentMetadata {
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
         * 查找JSON 行内注释集合并返回匹配结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findJsonInlineComments(line: string): CommentEntry[] {
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
         * 构建JSON 数组起始行深度供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildJsonArrayDepthAtLineStart(lines: string[]): number[] {
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
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildJsonObjectDepthAtLineStart(lines: string[]): number[] {
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
}
