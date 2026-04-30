import { FileType } from '../../fileTypes';
import { escapeRegex } from '../../utils';
import {
    ArrayItemLineLocator,
    CommentEntry,
    CommentMarker,
    CommentMetadata,
    JsonCloseLineLocator,
    KeyLineLocator,
    StandaloneCommentGroup,
    YamlCloseLineLocator,
    XmlCloseLineLocator,
} from '../core/datatreeProviderTypes';

/**
 * 提供数据树定位与注释绑定基础能力
 */
export class DatatreeLocatorAndCommentBase {
    protected static readonly MAX_HTML_LENGTH = 10 * 1024 * 1024;

    /**
         * 预留 TOML 路径索引实现入口供文件类型基类覆盖
         */
        protected static buildTomlPathLineIndex(..._args: any[]): any {
            throw new Error('buildTomlPathLineIndex must be implemented by file type base');
        }

        /**
         * 预留 JSON 数组元素行索引实现入口供文件类型基类覆盖
         */
        protected static buildJsonArrayItemLineIndex(..._args: any[]): any {
            throw new Error('buildJsonArrayItemLineIndex must be implemented by file type base');
        }

        /**
         * 预留 YAML 数组元素行索引实现入口供文件类型基类覆盖
         */
        protected static buildYamlArrayItemLineIndex(..._args: any[]): any {
            throw new Error('buildYamlArrayItemLineIndex must be implemented by file type base');
        }

        /**
         * 预留 TOML 数组元素行索引实现入口供文件类型基类覆盖
         */
        protected static buildTomlArrayItemLineIndex(..._args: any[]): any {
            throw new Error('buildTomlArrayItemLineIndex must be implemented by file type base');
        }

        /**
         * 预留 XML 数组元素行索引实现入口供文件类型基类覆盖
         */
        protected static buildXmlArrayItemLineIndex(..._args: any[]): any {
            throw new Error('buildXmlArrayItemLineIndex must be implemented by file type base');
        }

        /**
         * 预留 JSON 注释元数据实现入口供文件类型基类覆盖
         */
        protected static buildJsonCommentMetadata(..._args: any[]): any {
            throw new Error('buildJsonCommentMetadata must be implemented by file type base');
        }

        /**
         * 预留井号注释元数据实现入口供文件类型基类覆盖
         */
        protected static buildHashCommentMetadata(..._args: any[]): any {
            throw new Error('buildHashCommentMetadata must be implemented by file type base');
        }

        /**
         * 预留 XML 注释元数据实现入口供文件类型基类覆盖
         */
        protected static buildXmlCommentMetadata(..._args: any[]): any {
            throw new Error('buildXmlCommentMetadata must be implemented by file type base');
        }

        /**
         * 预留 JSON 键提取实现入口供文件类型基类覆盖
         */
        protected static extractJsonKeys(..._args: any[]): any {
            throw new Error('extractJsonKeys must be implemented by file type base');
        }

        /**
         * 预留 YAML 键提取实现入口供文件类型基类覆盖
         */
        protected static extractYamlKeys(..._args: any[]): any {
            throw new Error('extractYamlKeys must be implemented by file type base');
        }

        /**
         * 预留 TOML 键提取实现入口供文件类型基类覆盖
         */
        protected static extractTomlKeys(..._args: any[]): any {
            throw new Error('extractTomlKeys must be implemented by file type base');
        }

        /**
         * 预留 XML 键提取实现入口供文件类型基类覆盖
         */
        protected static extractXmlKeys(..._args: any[]): any {
            throw new Error('extractXmlKeys must be implemented by file type base');
        }

        /**
         * 预留 XML 属性键判定实现入口供文件类型基类覆盖
         */
        protected static isXmlAttributeKey(..._args: any[]): any {
            throw new Error('isXmlAttributeKey must be implemented by file type base');
        }

        /**
         * 预留 XML 文本键判定实现入口供文件类型基类覆盖
         */
        protected static isXmlTextLikeKey(..._args: any[]): any {
            throw new Error('isXmlTextLikeKey must be implemented by file type base');
        }

        /**
         * 预留 XML 文本键行构建实现入口供文件类型基类覆盖
         */
        protected static buildXmlTextLikeKeyLines(..._args: any[]): any {
            throw new Error('buildXmlTextLikeKeyLines must be implemented by file type base');
        }

        /**
         * 预留 YAML 文档数组判定实现入口供文件类型基类覆盖
         */
        protected static shouldUseYamlDocumentArrayLines(..._args: any[]): any {
            throw new Error('shouldUseYamlDocumentArrayLines must be implemented by file type base');
        }

        /**
         * 预留 YAML 文档起始行实现入口供文件类型基类覆盖
         */
        protected static findYamlDocumentStartLines(..._args: any[]): any {
            throw new Error('findYamlDocumentStartLines must be implemented by file type base');
        }

        /**
         * 预留 TOML 数组深度实现入口供文件类型基类覆盖
         */
        protected static buildTomlArrayDepthAtLineStart(..._args: any[]): any {
            throw new Error('buildTomlArrayDepthAtLineStart must be implemented by file type base');
        }

    /**
         * 创建键行定位器并返回可复用实例
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @returns 返回可复用实例
         */
        protected static createKeyLineLocator(lines: string[], fileType: FileType): KeyLineLocator {
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
         * 创建数组元素行定位器并返回可复用实例
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @param parsedData - 已解析的结构化数据
         * @returns 返回可复用实例
         */
        protected static createArrayItemLineLocator(lines: string[], fileType: FileType, parsedData: unknown): ArrayItemLineLocator {
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
         * 构建数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @param parsedData - 已解析的结构化数据
         * @returns 返回构建后的数据结构
         */
        protected static buildArrayItemLineIndex(lines: string[], fileType: FileType, parsedData: unknown): number[] {
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
         * 处理 consumeIndexedLine 相关逻辑
         * @param index - 索引映射对象
         * @param cursor - 独立注释组遍历游标
         * @param key - 当前处理的键名
         * @returns 返回当前键对应的下一条行号
         */
        protected static consumeIndexedLine(
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
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @returns 返回构建后的数据结构
         */
        protected static buildPrimaryKeyLineIndex(lines: string[], fileType: FileType): Map<string, number[]> {
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
         * @param key - 当前处理的键名
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @returns 返回构建后的数据结构
         */
        protected static buildFallbackKeyLines(key: string, lines: string[], fileType: FileType): number[] {
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
                    } else if (this.isXmlTextLikeKey(key)) {
                        return this.buildXmlTextLikeKeyLines(key, lines);
                    } else {
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
         * @param line - 当前处理的行内容或行号
         * @param fileType - 当前文件类型标识
         * @returns 返回当前行提取到的键名列表
         */
        protected static extractKeysFromLine(line: string, fileType: FileType): string[] {
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
         * 向目标集合追加带索引行
         * @param index - 索引映射对象
         * @param key - 当前处理的键名
         * @param line - 当前处理的行内容或行号
         */
        protected static pushIndexedLine(index: Map<string, number[]>, key: string, line: number): void {
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
         * @param lines - 按行拆分后的源文本
         * @param fileType - 当前文件类型标识
         * @returns 返回构建后的数据结构
         */
        protected static buildCommentMetadata(lines: string[], fileType: FileType): CommentMetadata {
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
         * 向目标集合追加注释
         * @param target - 目标对象或目标元素
         * @param marker - 注释标记类型
         * @param text - 待处理的文本内容
         */
        protected static pushComment(target: CommentEntry[], marker: CommentMarker, text: string): void {
            if (!text) {
                return;
            }
            target.push({ marker, text });
        }

    /**
         * 去除井号注释文本以保留有效信息
         * @param line - 当前处理的行内容或行号
         * @returns 返回移除井号注释后的文本
         */
        protected static stripHashCommentText(line: string): string {
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
         * 获取缩进并返回结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回当前行的缩进宽度
         */
        protected static getIndentation(line: string): number {
            const match = line.match(/^\s*/);
            return match ? match[0].length : 0;
        }

    /**
         * 处理 pushStandaloneGroup 相关逻辑
         * @param groups - 独立注释分组集合
         * @param line - 当前处理的行内容或行号
         * @param comments - 注释项集合
         * @param rootOnly - 是否仅在根节点展示该注释组
         */
        protected static pushStandaloneGroup(
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
         * @param text - 待处理的文本内容
         * @returns 返回清洗后的注释文本
         */
        protected static cleanCommentText(text: string): string {
            return text
                .split('\n')
                .map(line => line.trim().replace(/^\*+\s?/, ''))
                .join('\n')
                .trim();
        }
}
