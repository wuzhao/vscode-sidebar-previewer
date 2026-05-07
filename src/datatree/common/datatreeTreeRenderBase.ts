import { FileType } from '../../fileTypes';
import { escapeHtml } from '../../utils';
import {
    ArrayItemLineLocator,
    CommentEntry,
    CommentLineIndex,
    JsonCloseLineLocator,
    KeyLineLocator,
    StandaloneCommentGroup,
    StandaloneCommentCursor,
    YamlCloseLineLocator,
    XmlCloseLineLocator,
} from '../core/datatreeProviderTypes';
import { DatatreeLocatorAndCommentBase } from './datatreeLocatorAndCommentBase';

/**
 * 提供数据树渲染与边界处理基础能力
 */
export class DatatreeTreeRenderBase extends DatatreeLocatorAndCommentBase {
    /**
         * 渲染注释图标并返回可展示内容
         * @param comments - 注释项集合
         * @returns 返回可展示内容
         */
        protected static renderCommentIcon(comments: CommentEntry[]): string {
            const encodedComments = escapeHtml(JSON.stringify(comments));
            const ariaLabel = escapeHtml(comments.map(comment => `${comment.marker} ${comment.text}`).join('\n')).replace(/\n/g, '&#10;');
            return `<span class="tree-comment-icon codicon codicon-note" data-comments="${encodedComments}" aria-label="${ariaLabel}" tabindex="0"></span>`;
        }

    /**
         * 渲染注释指定行图标并返回可展示内容
         * @param line - 当前处理的行内容或行号
         * @param commentLines - 按行组织的注释索引
         * @returns 返回可展示内容
         */
        protected static renderCommentIconForLine(line: number, commentLines: CommentLineIndex): string {
            if (line < 0 || !commentLines.has(line)) {
                return '';
            }
            return this.renderCommentIcon(commentLines.get(line) as CommentEntry[]);
        }

    /**
         * 处理 renderCommentIconForEntry 相关逻辑
         * @param line - 当前处理的行内容或行号
         * @param commentLines - 按行组织的注释索引
         * @param fileType - 当前文件类型标识
         * @param entryKey - 当前节点键名
         * @param sourceLines - 原始文本行集合
         * @param xmlConsumedLines - 已消费的 XML 注释行集合
         * @returns 返回当前条目的注释图标 HTML
         */
        protected static renderCommentIconForEntry(
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

            const sourceLine = line < sourceLines.length ? sourceLines[line] : '';
            const isTomlTableArrayLine = fileType === 'toml' && this.isTomlTableArrayLine(sourceLine);
            const shouldBindTomlTableArrayToIndex = isTomlTableArrayLine && this.shouldRenderTomlTableArrayOnIndex(line, sourceLines);
            const isJsonInlineObjectLine = fileType === 'json' && /^\s*\{/.test(sourceLine);

            if (fileType === 'toml' && entryKey !== null && this.shouldSkipTomlInlineTableChildComment(sourceLine, entryKey)) {
                return '';
            }

            if (
                entryKey === null &&
                (fileType === 'yaml' || fileType === 'toml') &&
                line < sourceLines.length &&
                this.extractKeysFromLine(sourceLine, fileType).length > 0 &&
                !(isTomlTableArrayLine && shouldBindTomlTableArrayToIndex)
            ) {
                return '';
            }

            if (fileType === 'toml' && entryKey !== null && isTomlTableArrayLine && shouldBindTomlTableArrayToIndex) {
                return '';
            }

            if (fileType === 'json' && entryKey !== null && isJsonInlineObjectLine) {
                return '';
            }

            if (fileType === 'toml' && entryKey === null) {
                if (xmlConsumedLines && xmlConsumedLines.has(line)) {
                    return '';
                }
                if (xmlConsumedLines) {
                    xmlConsumedLines.add(line);
                }
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
         * 判断 TOML 内联表子键是否应跳过注释图标渲染
         * @param line - 当前处理的行内容或行号
         * @param entryKey - 当前节点键名
         * @returns 返回布尔判断结果
         */
        protected static shouldSkipTomlInlineTableChildComment(line: string, entryKey: string): boolean {
            const codeLine = this.stripHashCommentText(line);
            const equalIndex = codeLine.indexOf('=');
            if (equalIndex < 0) {
                return false;
            }

            const valueExpr = codeLine.slice(equalIndex + 1).trim();
            if (!valueExpr.startsWith('{')) {
                return false;
            }

            const pathSegments = this.extractTomlKeys(codeLine);
            if (pathSegments.length === 0) {
                return false;
            }

            const ownerKey = pathSegments[pathSegments.length - 1];
            return ownerKey.length > 0 && ownerKey !== entryKey;
        }

    /**
         * 判断 TOML 行是否为数组表头
         * @param line - 当前处理的行内容或行号
         * @returns 返回布尔判断结果
         */
        protected static isTomlTableArrayLine(line: string): boolean {
            const code = this.stripHashCommentText(line).trim();
            return /^\[\[.*\]\]$/.test(code);
        }

    /**
         * 判断 TOML 数组表头是否应绑定到索引节点
         * @param line - 当前处理的行内容或行号
         * @param sourceLines - 原始文本行集合
         * @returns 返回布尔判断结果
         */
        protected static shouldRenderTomlTableArrayOnIndex(line: number, sourceLines: string[]): boolean {
            if (line < 0 || line >= sourceLines.length) {
                return false;
            }

            const path = this.extractTomlTableArrayPath(sourceLines[line]);
            if (!path) {
                return false;
            }

            let count = 0;
            for (const sourceLine of sourceLines) {
                if (this.extractTomlTableArrayPath(sourceLine) !== path) {
                    continue;
                }

                count += 1;
                if (count > 1) {
                    return true;
                }
            }

            return false;
        }

    /**
         * 提取 TOML 数组表头路径并返回结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回路径表达式
         */
        protected static extractTomlTableArrayPath(line: string): string | null {
            const code = this.stripHashCommentText(line).trim();
            const match = code.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
            return match ? match[1].trim() : null;
        }

    /**
         * 创建独立注释游标并返回可复用实例
         * @param groups - 独立注释分组集合
         * @returns 返回可复用实例
         */
        protected static createStandaloneCursor(groups: StandaloneCommentGroup[]): StandaloneCommentCursor {
            const sortedGroups = [...groups].sort((a, b) => a.line - b.line);
            return {
                groups: sortedGroups,
                index: 0,
            };
        }

    /**
         * 处理 renderStandaloneBeforeBoundary 相关逻辑
         * @param cursor - 独立注释组遍历游标
         * @param boundaryExclusive - 边界行号（不含边界本行）
         * @param includeRootOnly - 是否仅输出根级注释
         * @returns 返回边界前的独立注释 HTML
         */
        protected static renderStandaloneBeforeBoundary(
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
         * @param line - 当前处理的行内容或行号
         * @param fallback - 回退使用的默认行号
         * @returns 返回最终结果
         */
        protected static resolveBoundaryLine(line: number, fallback: number): number {
            return line >= 0 ? line : fallback;
        }

    /**
         * 处理 constrainBoundaryForJsonContainer 相关逻辑
         * @param fileType - 当前文件类型标识
         * @param line - 当前处理的行内容或行号
         * @param boundaryExclusive - 边界行号（不含边界本行）
         * @param jsonCloseLineLocator - JSON 结束行定位器
         * @returns 返回 JSON 容器约束后的边界行
         */
        protected static constrainBoundaryForJsonContainer(
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
         * @param fileType - 当前文件类型标识
         * @param line - 当前处理的行内容或行号
         * @param boundaryExclusive - 边界行号（不含边界本行）
         * @param yamlCloseLineLocator - YAML 结束行定位器
         * @returns 返回 YAML 容器约束后的边界行
         */
        protected static constrainBoundaryForYamlContainer(
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
         * @param fileType - 当前文件类型标识
         * @param line - 当前处理的行内容或行号
         * @param boundaryExclusive - 边界行号（不含边界本行）
         * @param xmlCloseLineLocator - XML 结束行定位器
         * @returns 返回 XML 容器约束后的边界行
         */
        protected static constrainBoundaryForXmlContainer(
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
         * @param data - 待处理的数据对象
         * @returns 返回布尔判断结果
         */
        protected static isCompound(data: unknown): boolean {
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
             * 判断当前容器是否为 YAML 内联数组
             * @param fileType - 当前文件类型标识
             * @param sourceLines - 原始文本行集合
             * @param containerLine - 容器绑定行号
             * @returns 返回布尔判断结果
             */
            protected static isYamlInlineArrayContainer(
                fileType: FileType,
                sourceLines: string[],
                containerLine: number | null
            ): boolean {
                if (fileType !== 'yaml' || containerLine === null || containerLine < 0 || containerLine >= sourceLines.length) {
                    return false;
                }

                return this.isYamlInlineArrayLine(sourceLines[containerLine]);
            }

        /**
             * 判断 YAML 行是否为内联数组定义
             * @param line - 当前处理的行内容或行号
             * @returns 返回布尔判断结果
             */
            protected static isYamlInlineArrayLine(line: string): boolean {
                const code = this.stripHashCommentText(line).trim();
                if (code.length === 0) {
                    return false;
                }

                return /^-\s*\[.*\]\s*$/.test(code)
                    || /:\s*\[.*\]\s*$/.test(code)
                    || /^\[.*\]\s*$/.test(code);
            }

            /**
                 * 查找 YAML 数组容器的直属元素行集合并返回匹配结果
                 * @param sourceLines - 原始文本行集合
                 * @param containerLine - 容器绑定行号
                 * @param boundaryExclusive - 边界行号（不含边界本行）
                 * @returns 返回匹配结果
                 */
                protected static findYamlDirectArrayItemLines(
                    sourceLines: string[],
                    containerLine: number,
                    boundaryExclusive: number
                ): number[] {
                    if (containerLine < 0 || containerLine >= sourceLines.length) {
                        return [];
                    }

                    const containerRaw = sourceLines[containerLine];
                    const containerCode = this.stripHashCommentText(containerRaw).trim();
                    if (containerCode.length === 0 || containerCode.startsWith('-')) {
                        return [];
                    }

                    const result: number[] = [];
                    const containerIndent = this.getIndentation(containerRaw);
                    const limit = Number.isFinite(boundaryExclusive)
                        ? Math.min(boundaryExclusive, sourceLines.length)
                        : sourceLines.length;
                    let itemIndent = -1;

                    for (let row = containerLine + 1; row < limit; row++) {
                        const line = sourceLines[row];
                        const trimmed = line.trim();
                        if (trimmed.length === 0 || trimmed.startsWith('#')) {
                            continue;
                        }

                        const indent = this.getIndentation(line);
                        if (indent <= containerIndent) {
                            break;
                        }

                        if (!trimmed.startsWith('-')) {
                            continue;
                        }

                        if (itemIndent < 0) {
                            itemIndent = indent;
                        }

                        if (indent === itemIndent) {
                            result.push(row);
                        }
                    }

                    return result;
                }

        /**
             * 解析数组项行号并返回最终结果
             * @param arrayItemLineLocator - 数组元素行号定位器
             * @param fileType - 当前文件类型标识
             * @param sourceLines - 原始文本行集合
             * @param containerLine - 容器绑定行号
                 * @param yamlDirectItemLines - YAML 直属元素行集合
                 * @param itemIndex - 当前元素索引
             * @returns 返回最终结果
             */
            protected static resolveArrayItemLine(
                arrayItemLineLocator: ArrayItemLineLocator,
                fileType: FileType,
                sourceLines: string[],
                    containerLine: number | null,
                    yamlDirectItemLines: number[],
                    itemIndex: number
            ): number {
                    const fallbackLine = arrayItemLineLocator.next();

                    if (fileType !== 'yaml') {
                        return fallbackLine;
                    }

                if (this.isYamlInlineArrayContainer(fileType, sourceLines, containerLine)) {
                        return containerLine as number;
                    }

                    if (itemIndex >= 0 && itemIndex < yamlDirectItemLines.length) {
                        return yamlDirectItemLines[itemIndex];
                }

                    return fallbackLine;
            }

    /**
         * 渲染复合值的子节点
         * @param data - 待处理的数据对象
         * @param lineLocator - 键行号定位器
         * @param arrayItemLineLocator - 数组元素行号定位器
         * @param commentLines - 按行组织的注释索引
         * @param standaloneCursor - 独立注释渲染游标
         * @param boundaryExclusive - 边界行号（不含边界本行）
         * @param fileType - 当前文件类型标识
         * @param sourceLines - 原始文本行集合
         * @param jsonCloseLineLocator - JSON 结束行定位器
         * @param yamlCloseLineLocator - YAML 结束行定位器
         * @param xmlCloseLineLocator - XML 结束行定位器
         * @param xmlConsumedLines - 已消费的 XML 注释行集合
         * @param parentPath - 父级路径片段集合
         * @param xmlDeferredFirstItemComments - 首个数组项延迟注释映射
         * @param containerLine - 容器绑定行号
         * @returns 返回渲染后的内容
         */
        protected static renderCompoundChildren(
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
            xmlDeferredFirstItemComments: CommentEntry[] | null = null,
            containerLine: number | null = null
        ): string {
            let html = '<div class="tree-children">';
            if (Array.isArray(data)) {
                const isYamlInlineArray = this.isYamlInlineArrayContainer(fileType, sourceLines, containerLine);
                const yamlDirectItemLines = (
                    fileType === 'yaml'
                    && !isYamlInlineArray
                    && containerLine !== null
                )
                    ? this.findYamlDirectArrayItemLines(sourceLines, containerLine, boundaryExclusive)
                    : [];

                for (let i = 0; i < data.length; i++) {
                    const itemValue = data[i];
                    // Consume array lines lazily so nested arrays don't shift sibling item mapping.
                    const line = this.resolveArrayItemLine(
                        arrayItemLineLocator,
                        fileType,
                        sourceLines,
                        containerLine,
                        yamlDirectItemLines,
                        i
                    );
                    const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                    const deferredXmlIcon =
                        fileType === 'xml'
                        && i === 0
                        && xmlDeferredFirstItemComments
                        && xmlDeferredFirstItemComments.length > 0
                            ? this.renderCommentIcon(xmlDeferredFirstItemComments)
                            : '';
                    const commentIcon = deferredXmlIcon
                        || (isYamlInlineArray
                            ? ''
                            : this.renderCommentIconForEntry(line, commentLines, fileType, null, sourceLines, xmlConsumedLines));
                    const itemBoundary = this.resolveBoundaryLine(line, boundaryExclusive);

                    html += this.renderStandaloneBeforeBoundary(standaloneCursor, itemBoundary, false);

                    if (this.isCompound(itemValue)) {
                        const bracket = Array.isArray(itemValue)
                            ? `[${itemValue.length}]`
                            : `{${Object.keys(itemValue as Record<string, unknown>).length}}`;
                        let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, boundaryExclusive, jsonCloseLineLocator);
                        childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                        childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                        html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(itemValue, lineLocator, arrayItemLineLocator, commentLines, standaloneCursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, parentPath, null, line)}</details></div>`;
                    } else {
                        html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: ${this.renderPrimitive(itemValue)}</div>`;
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
                        html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(entry.value, lineLocator, arrayItemLineLocator, commentLines, standaloneCursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, entryPath, Array.isArray(entry.value) ? deferredXmlArrayComments : null, line)}</details></div>`;
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
         * @param data - 待处理的数据对象
         * @returns 返回渲染后的内容
         */
        protected static renderPrimitive(data: unknown): string {
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
         * @param data - 待处理的数据对象
         * @param lineLocator - 键行号定位器
         * @param arrayItemLineLocator - 数组元素行号定位器
         * @param commentLines - 按行组织的注释索引
         * @param standaloneGroups - 独立注释分组集合
         * @param fileType - 当前文件类型标识
         * @param sourceLines - 原始文本行集合
         * @param jsonCloseLineLocator - JSON 结束行定位器
         * @param yamlCloseLineLocator - YAML 结束行定位器
         * @param xmlCloseLineLocator - XML 结束行定位器
         * @returns 返回渲染后的内容
         */
        protected static renderTree(
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
            const xmlConsumedLines = (fileType === 'xml' || fileType === 'toml') ? new Set<number>() : null;
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
                for (let i = 0; i < data.length; i++) {
                    const itemValue = data[i];
                    const line = (yamlDocumentRootLines && i < yamlDocumentRootLines.length)
                        ? yamlDocumentRootLines[i]
                        : arrayItemLineLocator.next();
                    const nextBoundary = (yamlDocumentRootLines && i + 1 < yamlDocumentRootLines.length)
                        ? this.resolveBoundaryLine(yamlDocumentRootLines[i + 1], rootBoundary)
                        : rootBoundary;
                    const lineAttr = line >= 0 ? ` data-line="${line}"` : '';
                    const commentIcon = this.renderCommentIconForEntry(line, commentLines, fileType, null, sourceLines, xmlConsumedLines);
                    const itemBoundary = this.resolveBoundaryLine(line, rootBoundary);

                    html += this.renderStandaloneBeforeBoundary(cursor, itemBoundary, true);

                    if (this.isCompound(itemValue)) {
                        const bracket = Array.isArray(itemValue)
                            ? `[${itemValue.length}]`
                            : `{${Object.keys(itemValue as Record<string, unknown>).length}}`;
                        let childBoundary = this.constrainBoundaryForJsonContainer(fileType, line, nextBoundary, jsonCloseLineLocator);
                        if (isYamlDocumentRootArray) {
                            childBoundary = nextBoundary;
                        } else {
                            childBoundary = this.constrainBoundaryForYamlContainer(fileType, line, childBoundary, yamlCloseLineLocator);
                        }
                        childBoundary = this.constrainBoundaryForXmlContainer(fileType, line, childBoundary, xmlCloseLineLocator);
                        html += `<div class="tree-item"><details><summary><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(itemValue, lineLocator, arrayItemLineLocator, commentLines, cursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, [], null, line)}</details></div>`;
                    } else {
                        html += `<div class="tree-item"><span class="tree-index"${lineAttr}>${i}</span>${commentIcon}: ${this.renderPrimitive(itemValue)}</div>`;
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
                        html += `<div class="tree-item"><details><summary><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: <span class="tree-bracket">${bracket}</span></summary>${this.renderCompoundChildren(entry.value, lineLocator, arrayItemLineLocator, commentLines, cursor, childBoundary, fileType, sourceLines, jsonCloseLineLocator, yamlCloseLineLocator, xmlCloseLineLocator, xmlConsumedLines, [entry.key], Array.isArray(entry.value) ? deferredXmlArrayComments : null, line)}</details></div>`;
                    } else {
                        html += `<div class="tree-item"><span class="tree-key"${lineAttr}>${escapeHtml(entry.key)}</span>${commentIcon}: ${this.renderPrimitive(entry.value)}</div>`;
                    }
                }
            }

            html += this.renderStandaloneBeforeBoundary(cursor, rootBoundary, true);
            return html;
        }
}
