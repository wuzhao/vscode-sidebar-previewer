import { FileType } from '../../fileTypes';
import { escapeRegex } from '../../utils';
import {
    ArrayItemLineLocator,
    CommentEntry,
    CommentMarker,
    CommentMetadata,
    KeyLineLocator,
    StandaloneCommentGroup,
} from '../core/datatreeProviderTypes';

/**
 * 提供数据树定位与注释绑定基础能力
 */
export class DatatreeLocatorAndCommentBase {
    /**
     * 声明 TOML 路径到源码行的索引能力供格式策略覆盖
     * @param _lines - 按行拆分后的 TOML 源文本
     * @returns TOML 完整路径对应的候选行号集合
     */
    protected static buildTomlPathLineIndex(_lines: string[]): Map<string, number[]> {
        throw new Error('buildTomlPathLineIndex must be implemented by file type base');
    }

    /**
     * 声明 JSON 数组元素源码行索引能力供格式策略覆盖
     * @param _lines - 按行拆分后的 JSON 源文本
     * @returns 按渲染顺序排列的数组元素行号
     */
    protected static buildJsonArrayItemLineIndex(_lines: string[]): number[] {
        throw new Error('buildJsonArrayItemLineIndex must be implemented by file type base');
    }

    /**
     * 声明 JSONL 记录源码行索引能力供格式策略覆盖
     * @param _lines - 按行拆分后的 JSONL 源文本
     * @param _parsedData - 已解析的 JSONL 记录集合
     * @returns 按记录顺序排列的源码行号
     */
    protected static buildJsonlArrayItemLineIndex(_lines: string[], _parsedData: unknown): number[] {
        throw new Error('buildJsonlArrayItemLineIndex must be implemented by file type base');
    }

    /**
     * 声明 YAML 数组元素源码行索引能力供格式策略覆盖
     * @param _lines - 按行拆分后的 YAML 源文本
     * @param _includeDocumentRootItems - 是否把多文档根节点纳入数组项索引
     * @returns 按渲染顺序排列的数组元素行号
     */
    protected static buildYamlArrayItemLineIndex(_lines: string[], _includeDocumentRootItems: boolean): number[] {
        throw new Error('buildYamlArrayItemLineIndex must be implemented by file type base');
    }

    /**
     * 声明 TOML 数组元素源码行索引能力供格式策略覆盖
     * @param _lines - 按行拆分后的 TOML 源文本
     * @returns 按渲染顺序排列的数组元素行号
     */
    protected static buildTomlArrayItemLineIndex(_lines: string[]): number[] {
        throw new Error('buildTomlArrayItemLineIndex must be implemented by file type base');
    }

    /**
     * 声明 JSON 注释归属分析能力供格式策略覆盖
     * @param _lines - 按行拆分后的 JSON 源文本
     * @param _arrayItemLines - JSON 数组元素对应的源码行集合
     * @returns 注释行索引和独立注释分组
     */
    protected static buildJsonCommentMetadata(_lines: string[], _arrayItemLines: Set<number>): CommentMetadata {
        throw new Error('buildJsonCommentMetadata must be implemented by file type base');
    }

    /**
     * 声明 YAML 和 TOML 井号注释归属分析能力供格式策略覆盖
     * @param _lines - 按行拆分后的源文本
     * @param _fileType - 使用井号注释的文件格式
     * @param _arrayItemLines - 数组元素对应的源码行集合
     * @returns 注释行索引和独立注释分组
     */
    protected static buildHashCommentMetadata(
        _lines: string[],
        _fileType: 'yaml' | 'toml',
        _arrayItemLines: Set<number>,
    ): CommentMetadata {
        throw new Error('buildHashCommentMetadata must be implemented by file type base');
    }

    /**
     * 声明 XML 注释归属分析能力供格式策略覆盖
     * @param _lines - 按行拆分后的 XML 源文本
     * @returns 注释行索引和独立注释分组
     */
    protected static buildXmlCommentMetadata(_lines: string[]): CommentMetadata {
        throw new Error('buildXmlCommentMetadata must be implemented by file type base');
    }

    /**
     * 声明从 JSON 源码行提取键名的能力供格式策略覆盖
     * @param _line - 待分析的 JSON 源码行
     * @returns 当前行声明的键名集合
     */
    protected static extractJsonKeys(_line: string): string[] {
        throw new Error('extractJsonKeys must be implemented by file type base');
    }

    /**
     * 声明从 YAML 源码行提取键名的能力供格式策略覆盖
     * @param _line - 待分析的 YAML 源码行
     * @returns 当前行声明的键名集合
     */
    protected static extractYamlKeys(_line: string): string[] {
        throw new Error('extractYamlKeys must be implemented by file type base');
    }

    /**
     * 声明从 TOML 源码行提取键名的能力供格式策略覆盖
     * @param _line - 待分析的 TOML 源码行
     * @returns 当前行声明的键名集合
     */
    protected static extractTomlKeys(_line: string): string[] {
        throw new Error('extractTomlKeys must be implemented by file type base');
    }

    /**
     * 声明从 XML 源码行提取元素和属性键的能力供格式策略覆盖
     * @param _line - 待分析的 XML 源码行
     * @returns 当前行声明的元素和属性键集合
     */
    protected static extractXmlKeys(_line: string): string[] {
        throw new Error('extractXmlKeys must be implemented by file type base');
    }

    /**
     * 声明 XML 属性键判定能力供格式策略覆盖
     * @param _key - 待判断的标准化 XML 键名
     * @returns 当前键是否表示 XML 属性
     */
    protected static isXmlAttributeKey(_key: string): boolean {
        throw new Error('isXmlAttributeKey must be implemented by file type base');
    }

    /**
     * 声明 XML 文本类键判定能力供格式策略覆盖
     * @param _key - 待判断的标准化 XML 键名
     * @returns 当前键是否表示文本、CDATA 或声明
     */
    protected static isXmlTextLikeKey(_key: string): boolean {
        throw new Error('isXmlTextLikeKey must be implemented by file type base');
    }

    /**
     * 声明 XML 文本类节点源码行索引能力供格式策略覆盖
     * @param _key - 待定位的标准化 XML 文本类键名
     * @param _lines - 按行拆分后的 XML 源文本
     * @returns 与文本类节点对应的源码行号集合
     */
    protected static buildXmlTextLikeKeyLines(_key: string, _lines: string[]): number[] {
        throw new Error('buildXmlTextLikeKeyLines must be implemented by file type base');
    }

    /**
     * 声明 YAML 多文档根数组判定能力供格式策略覆盖
     * @param _parsedData - 已解析的 YAML 文档集合
     * @param _lines - 按行拆分后的 YAML 源文本
     * @returns 是否使用文档根数组行号定位
     */
    protected static shouldUseYamlDocumentArrayLines(_parsedData: unknown, _lines: string[]): boolean {
        throw new Error('shouldUseYamlDocumentArrayLines must be implemented by file type base');
    }

    /**
     * 声明 YAML 文档起始行扫描能力供格式策略覆盖
     * @param _lines - 按行拆分后的 YAML 源文本
     * @returns 每个 YAML 文档根节点对应的源码行号
     */
    protected static findYamlDocumentStartLines(_lines: string[]): number[] {
        throw new Error('findYamlDocumentStartLines must be implemented by file type base');
    }

    /**
     * 声明 TOML 数组深度扫描能力供格式策略覆盖
     * @param _lines - 按行拆分后的 TOML 源文本
     * @returns 每一源码行开始位置的数组嵌套深度
     */
    protected static buildTomlArrayDepthAtLineStart(_lines: string[]): number[] {
        throw new Error('buildTomlArrayDepthAtLineStart must be implemented by file type base');
    }

    /**
     * 创建键行定位器并返回按调用顺序消费源码位置的游标或定位器
     * @param lines - 按行拆分后的源文本
     * @param fileType - 当前文件类型标识
     * @returns 返回按调用顺序消费源码位置的游标或定位器
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
            },
        };
    }

    /**
     * 将数组项源码行索引转换为渲染顺序游标
     * @param itemLines - 按预览遍历顺序排列的数组项行号
     * @returns 顺序读取下一数组项源码行的定位器
     */
    protected static createArrayItemLineLocator(itemLines: number[]): ArrayItemLineLocator {
        let cursor = 0;

        return {
            next: (): number => {
                if (cursor >= itemLines.length) {
                    return -1;
                }
                const line = itemLines[cursor];
                cursor += 1;
                return line;
            },
        };
    }

    /**
     * 构建数组元素行索引供后续流程复用
     * @param lines - 按行拆分后的源文本
     * @param fileType - 当前文件类型标识
     * @param parsedData - 已解析的结构化数据
     * @returns 返回供节点定位与注释归属使用的索引数据
     */
    protected static buildArrayItemLineIndex(lines: string[], fileType: FileType, parsedData: unknown): number[] {
        switch (fileType) {
            case 'json':
                return this.buildJsonArrayItemLineIndex(lines);
            case 'jsonl':
                return this.buildJsonlArrayItemLineIndex(lines, parsedData);
            case 'yaml':
                // YAML 文档根条目由 renderTree 直接定位
                // 全局数组定位器只消费使用短横线声明的真实数组项
                return this.buildYamlArrayItemLineIndex(lines, false);
            case 'toml':
                return this.buildTomlArrayItemLineIndex(lines);
            default:
                return [];
        }
    }

    /**
     * 从键名索引中顺序取得尚未消费的源码行
     * @param index - 索引映射对象
     * @param cursor - 独立注释组遍历游标
     * @param key - 当前处理的键名
     * @param minLine - 所属容器起始行，用于跳过更早容器中的同名节点
     * @returns 返回当前键对应的下一条行号
     */
    protected static consumeIndexedLine(index: Map<string, number[]>, cursor: Map<string, number>, key: string, minLine = -1): number {
        const candidates = index.get(key);
        if (!candidates || candidates.length === 0) {
            return -1;
        }

        let current = cursor.get(key) ?? 0;
        while (current < candidates.length && candidates[current] < minLine) current++;
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
     * @returns 返回供节点定位与注释归属使用的索引数据
     */
    protected static buildPrimaryKeyLineIndex(lines: string[], fileType: FileType): Map<string, number[]> {
        const index = new Map<string, number[]>();
        const xmlLastPushed = new Map<string, { line: number; indent: number }>();
        const xmlStartTagLineIndex = fileType === 'xml' ? this.buildXmlStartTagLineIndex(lines) : null;

        for (let i = 0; i < lines.length; i++) {
            const keys = this.extractKeysFromLine(lines[i], fileType);
            for (const key of keys) {
                let targetLine = i;
                if (fileType === 'xml' && this.isXmlAttributeKey(key) && xmlStartTagLineIndex) {
                    targetLine = xmlStartTagLineIndex[i] ?? i;
                }

                if (fileType === 'xml' && !this.isXmlAttributeKey(key)) {
                    const currentIndent = this.getIndentation(lines[targetLine]);
                    const previous = xmlLastPushed.get(key);
                    if (previous && previous.line === targetLine - 1 && previous.indent === currentIndent) {
                        previous.line = targetLine;
                        continue;
                    }
                    xmlLastPushed.set(key, { line: targetLine, indent: currentIndent });
                }
                this.pushIndexedLine(index, key, targetLine);
            }
        }

        return index;
    }

    /**
     * 构建 XML 起始标签行索引供后续流程复用
     * @param lines - 按行拆分后的源文本
     * @returns 返回每行对应的起始标签行号集合
     */
    protected static buildXmlStartTagLineIndex(lines: string[]): number[] {
        const startLineIndex = lines.map((_, line) => line);
        let openTagStartLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let inSingleQuote = false;
            let inDoubleQuote = false;

            if (openTagStartLine >= 0) {
                startLineIndex[i] = openTagStartLine;
            }

            for (let cursor = 0; cursor < line.length; cursor++) {
                const ch = line[cursor];

                if (!inDoubleQuote && ch === "'") {
                    inSingleQuote = !inSingleQuote;
                    continue;
                }

                if (!inSingleQuote && ch === '"') {
                    inDoubleQuote = !inDoubleQuote;
                    continue;
                }

                if (inSingleQuote || inDoubleQuote) {
                    continue;
                }

                if (ch === '<') {
                    const next = line[cursor + 1] ?? '';
                    if (next === '/' || next === '?' || next === '!') {
                        continue;
                    }

                    if (openTagStartLine < 0) {
                        openTagStartLine = i;
                        startLineIndex[i] = i;
                    }
                    continue;
                }

                if (ch === '>' && openTagStartLine >= 0) {
                    openTagStartLine = -1;
                }
            }
        }

        return startLineIndex;
    }

    /**
     * 构建兜底键行集合供后续流程复用
     * @param key - 当前处理的键名
     * @param lines - 按行拆分后的源文本
     * @param fileType - 当前文件类型标识
     * @returns 返回供节点定位与注释归属使用的索引数据
     */
    protected static buildFallbackKeyLines(key: string, lines: string[], fileType: FileType): number[] {
        const escaped = escapeRegex(key);
        const patterns: RegExp[] = [];

        switch (fileType) {
            case 'json':
            case 'jsonl':
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
                } else if (key === '#DECLARATION') {
                    patterns.push(/^\s*<!DOCTYPE\b/i);
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
            if (patterns.some((pattern) => pattern.test(lines[i]))) {
                matches.push(i);
            }
        }
        return matches;
    }

    /**
     * 提取行中的键供后续逻辑使用
     * @param line - 对应源码行的内容或零基行号
     * @param fileType - 当前文件类型标识
     * @returns 返回当前行提取到的键名列表
     */
    protected static extractKeysFromLine(line: string, fileType: FileType): string[] {
        switch (fileType) {
            case 'json':
            case 'jsonl':
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
     * @param line - 对应源码行的内容或零基行号
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
     * @returns 返回供节点定位与注释归属使用的索引数据
     */
    protected static buildCommentMetadata(lines: string[], fileType: FileType): CommentMetadata {
        const arrayItemLines = new Set(this.buildArrayItemLineIndex(lines, fileType, null));

        switch (fileType) {
            case 'json':
            case 'jsonl':
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
     * @param line - 对应源码行的内容或零基行号
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
                if (ch === "'") {
                    inSingle = false;
                }
                continue;
            }

            if (ch === '"') {
                inDouble = true;
                continue;
            }
            if (ch === "'") {
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
     * 计算源码行前导空白对应的缩进宽度
     * @param line - 对应源码行的内容或零基行号
     * @returns 返回当前行的缩进宽度
     */
    protected static getIndentation(line: string): number {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
    }

    /**
     * 追加可按源码位置渲染的独立注释分组
     * @param groups - 独立注释分组集合
     * @param line - 对应源码行的内容或零基行号
     * @param comments - 注释项集合
     * @param rootOnly - 是否仅在根节点展示该注释组
     */
    protected static pushStandaloneGroup(groups: StandaloneCommentGroup[], line: number, comments: CommentEntry[], rootOnly = false): void {
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
     * 标准化注释文本并移除每行外围空白
     * @param text - 待处理的文本内容
     * @returns 返回清洗后的注释文本
     */
    protected static cleanCommentText(text: string): string {
        return text
            .split('\n')
            .map((line) => line.trim().replace(/^\*+\s?/, ''))
            .join('\n')
            .trim();
    }
}
