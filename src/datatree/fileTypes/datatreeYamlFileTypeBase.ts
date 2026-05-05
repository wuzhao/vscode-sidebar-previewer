import {
    CommentEntry,
    CommentMetadata,
    StandaloneCommentGroup,
    YamlCloseLineLocator,
} from '../core/datatreeProviderTypes';
import { DatatreeJsonFileTypeBase } from './datatreeJsonFileTypeBase';

/**
 * 提供 YAML 数据树能力
 */
export class DatatreeYamlFileTypeBase extends DatatreeJsonFileTypeBase {
    /**
         * 创建YAML 结束行定位器并返回可复用实例
         * @param lines - 按行拆分后的源文本
         * @returns 返回可复用实例
         */
        protected static createYamlCloseLineLocator(lines: string[]): YamlCloseLineLocator {
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

                        if (trimmed.startsWith('#')) {
                            const commentIndent = this.getIndentation(lines[row]);
                            if (commentIndent > startIndent) {
                                continue;
                            }

                            let nextSignificant = -1;
                            for (let next = row + 1; next < lines.length; next++) {
                                const nextTrimmed = lines[next].trim();
                                if (nextTrimmed.length === 0 || nextTrimmed.startsWith('#')) {
                                    continue;
                                }

                                nextSignificant = next;
                                break;
                            }

                            if (nextSignificant < 0 || this.getIndentation(lines[nextSignificant]) <= startIndent) {
                                cache.set(line, row);
                                return row;
                            }

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
         * 处理YAML 文档数组行集合相关逻辑并返回结果
         * @param parsedData - 已解析的结构化数据
         * @param lines - 按行拆分后的源文本
         * @returns 返回是否使用文档级 YAML 数组行索引
         */
        protected static shouldUseYamlDocumentArrayLines(parsedData: unknown, lines: string[]): boolean {
            if (!Array.isArray(parsedData)) {
                return false;
            }

            return lines.some(line => /^\s*---(?:\s+#.*)?\s*$/.test(line));
        }

    /**
         * 构建YAML数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @param includeDocumentRootItems - 是否包含文档根数组项
         * @returns 返回构建后的数据结构
         */
        protected static buildYamlArrayItemLineIndex(lines: string[], includeDocumentRootItems: boolean): number[] {
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
         * @param lines - 按行拆分后的源文本
         * @returns 返回匹配结果
         */
        protected static findYamlDocumentStartLines(lines: string[]): number[] {
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
         * 提取YAML 键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 YAML 行中提取到的键名列表
         */
        protected static extractYamlKeys(line: string): string[] {
            const match = line.match(/^\s*(?:-\s+)?(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^:#][^:]*?))\s*:(?:\s|$)/);
            if (!match) {
                return [];
            }

            const key = (match[1] ?? match[2] ?? match[3] ?? '').trim();
            return key ? [key] : [];
        }

    /**
         * 处理 buildHashCommentMetadata 相关逻辑
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @param arrayItemLines - 数组元素对应的行号集合
         * @returns 返回按井号注释解析后的元数据
         */
        protected static buildHashCommentMetadata(
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
         * 查找井号行内注释集合并返回匹配结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findHashInlineComments(line: string): CommentEntry[] {
            const codePart = this.stripHashCommentText(line);
            if (codePart.length === line.length) {
                return [];
            }

            const rawComment = line.slice(codePart.length + 1);
            const text = this.cleanCommentText(rawComment);
            return text ? [{ marker: '#', text }] : [];
        }

    /**
         * 根据上下文推断YAML 待绑定数组
         * @param lines - 按行拆分后的源文本
         * @param lineIndex - 当前处理的行索引
         * @param arrayItemLines - 数组元素对应的行号集合
         * @returns 返回是否应继续等待数组绑定
         */
        protected static inferYamlPendingFromArray(lines: string[], lineIndex: number, arrayItemLines: Set<number>): boolean {
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
         * @param lines - 按行拆分后的源文本
         * @param lineIndex - 当前处理的行索引
         * @param arrayItemLines - 数组元素对应的行号集合
         * @returns 返回匹配结果
         */
        protected static findYamlPreviousBindableLine(lines: string[], lineIndex: number, arrayItemLines: Set<number>): number {
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
         * @param lines - 按行拆分后的源文本
         * @param lineIndex - 当前处理的行索引
         * @param arrayItemLines - 数组元素对应的行号集合
         * @returns 返回匹配结果
         */
        protected static findYamlNextBindableLine(lines: string[], lineIndex: number, arrayItemLines: Set<number>): number {
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
         * @param line - 当前处理的行内容或行号
         * @returns 返回当前行是否包含行内值
         */
        protected static yamlLineHasInlineValue(line: string): boolean {
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
}
