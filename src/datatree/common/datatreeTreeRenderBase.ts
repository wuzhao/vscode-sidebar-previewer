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
