import { XMLParser } from 'fast-xml-parser';
import {
    CommentEntry,
    CommentMarker,
    CommentMetadata,
    StandaloneCommentGroup,
    XmlCloseLineLocator,
    XmlCommentScanState,
    XmlDtdBlock,
    XmlDtdDirective,
    XmlLineCommentScanResult,
    XmlTagMatch,
} from '../core/datatreeProviderTypes';
import { DatatreeTomlFileTypeBase } from './datatreeTomlFileTypeBase';

/**
 * 提供 XML 数据树能力
 */
export class DatatreeXmlFileTypeBase extends DatatreeTomlFileTypeBase {
    // 标准化 XML 文本节点键
    protected static readonly XML_TEXT_KEY = '#TEXT';

    // 标准化 XML CDATA 节点键
    protected static readonly XML_CDATA_KEY = '#CDATA';

    // 标准化 XML DOCTYPE 声明键
    protected static readonly XML_DECLARATION_KEY = '#DECLARATION';

    /**
         * 创建XML 结束行定位器并返回可复用实例
         * @param lines - 按行拆分后的源文本
         * @returns 返回可复用实例
         */
        protected static createXmlCloseLineLocator(lines: string[]): XmlCloseLineLocator {
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
         * 构建XML数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @param parsedData - 已解析的结构化数据
         * @returns 返回构建后的数据结构
         */
        protected static buildXmlArrayItemLineIndex(lines: string[], parsedData: unknown): number[] {
            if (!parsedData || typeof parsedData !== 'object') {
                return [];
            }

            const pathLineIndex = this.buildXmlElementPathLineIndex(lines);
            const pathCursor = new Map<string, number>();
            const result: number[] = [];
            this.collectXmlArrayItemLines(parsedData, [], pathLineIndex, pathCursor, result);
            return result;
        }

    /**
         * 构建XML 元素路径行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildXmlElementPathLineIndex(lines: string[]): Map<string, number[]> {
            const index = new Map<string, number[]>();
            const stack: string[] = [];
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
                            if (stack[j] !== tagName) {
                                continue;
                            }
                            stack.splice(j, 1);
                            break;
                        }
                        continue;
                    }

                    this.pushIndexedLine(index, [...stack, tagName].join('.'), i);
                    const isSelfClosing = /\/\s*>$/.test(raw);
                    if (!isSelfClosing) {
                        stack.push(tagName);
                    }
                }
            }

            return index;
        }

    /**
         * 递归提取XML数组元素行并写入结果
         * @param value - 待处理的数据对象
         * @param parentPath - 父级路径片段集合
         * @param pathLineIndex - 路径行索引
         * @param pathCursor - 路径消费游标
         * @param result - 数组元素行结果集合
         */
        protected static collectXmlArrayItemLines(
            value: unknown,
            parentPath: string[],
            pathLineIndex: Map<string, number[]>,
            pathCursor: Map<string, number>,
            result: number[]
        ): void {
            if (Array.isArray(value)) {
                const path = parentPath.join('.');
                for (const item of value) {
                    result.push(this.consumeIndexedLine(pathLineIndex, pathCursor, path));
                    this.collectXmlArrayItemLines(item, parentPath, pathLineIndex, pathCursor, result);
                }
                return;
            }

            if (!value || typeof value !== 'object') {
                return;
            }

            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                this.collectXmlArrayItemLines(child, [...parentPath, key], pathLineIndex, pathCursor, result);
            }
        }

    /**
         * 解析XML并返回结构化结果
         * @param content - 待解析的文件内容
         * @returns 返回结构化结果
         */
        protected static parseXml(content: string): unknown {
            const contentWithoutDtd = this.stripXmlDtdDeclarations(content);
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@',
                textNodeName: this.XML_TEXT_KEY,
                cdataPropName: this.XML_CDATA_KEY,
                parseTagValue: false,
                parseAttributeValue: false,
                trimValues: true,
                removeNSPrefix: false,
                processEntities: true,
                ignoreDeclaration: false,
                ignorePiTags: false,
            });

            const topLevelPiKeys = this.extractXmlTopLevelProcessingInstructionKeys(content);
            const dtdBlock = this.extractXmlDtdBlock(content);
            const parsed = parser.parse(contentWithoutDtd) as unknown;
            const normalized = this.normalizeXmlValue(parsed);
            return this.attachXmlDtdDirectives(normalized, topLevelPiKeys, dtdBlock);
        }

    /**
         * 提取XML 文档顶层处理指令键并保持源顺序
         * @param content - 待解析的文件内容
         * @returns 返回处理指令键列表
         */
        protected static extractXmlTopLevelProcessingInstructionKeys(content: string): string[] {
            const keys: string[] = [];
            const lines = content.split('\n');
            let inDtdBlock = false;

            for (const line of lines) {
                const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
                const trimmed = lineWithoutComments.trim();

                if (trimmed.length === 0) {
                    continue;
                }

                if (inDtdBlock) {
                    if (trimmed.includes(']>')) {
                        inDtdBlock = false;
                    }
                    continue;
                }

                if (/^<!DOCTYPE\b/i.test(trimmed)) {
                    if (trimmed.includes('[') && !trimmed.includes(']>')) {
                        inDtdBlock = true;
                    }
                    continue;
                }

                const piMatch = trimmed.match(/^<\?\s*([A-Za-z_:][\w:.-]*)\b/);
                if (piMatch) {
                    keys.push(`?${piMatch[1]}`);
                    continue;
                }

                if (/^<!/.test(trimmed)) {
                    continue;
                }

                if (trimmed.startsWith('<')) {
                    break;
                }
            }

            return keys;
        }

    /**
         * 去除XML DTD 声明文本以避免解析器产出伪元素
         * @param content - 待解析的文件内容
         * @returns 返回移除 DTD 后的 XML 文本
         */
        protected static stripXmlDtdDeclarations(content: string): string {
            const lines = content.split('\n');
            const keptLines: string[] = [];
            let inDtdBlock = false;

            for (const line of lines) {
                const trimmed = line.trim();

                if (!inDtdBlock && /^<!DOCTYPE\b/i.test(trimmed)) {
                    if (trimmed.includes('[') && !trimmed.includes(']>')) {
                        inDtdBlock = true;
                    }
                    continue;
                }

                if (inDtdBlock) {
                    if (trimmed.includes(']>')) {
                        inDtdBlock = false;
                    }
                    continue;
                }

                keptLines.push(line);
            }

            return keptLines.join('\n');
        }

    /**
         * 提取XML DTD 指令集合供后续流程复用
         * @param content - 待解析的文件内容
         * @returns 返回提取到的 DTD 指令集合
         */
        protected static extractXmlDtdBlock(content: string): XmlDtdBlock {
            const block: XmlDtdBlock = {
                doctype: null,
                directives: [],
            };
            const lines = content.split('\n');
            let inDtdBlock = false;

            for (const line of lines) {
                const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
                const trimmed = lineWithoutComments.trim();
                if (trimmed.length === 0 || trimmed.startsWith('<![CDATA[')) {
                    if (inDtdBlock && trimmed.includes(']>')) {
                        inDtdBlock = false;
                    }
                    continue;
                }

                if (inDtdBlock && trimmed.includes(']>')) {
                    inDtdBlock = false;
                }

                const directive = this.extractXmlDtdDirectiveFromLine(line);
                if (!directive) {
                    continue;
                }

                if (directive.key === '!DOCTYPE') {
                    block.doctype = directive;
                    if (trimmed.includes('[') && !trimmed.includes(']>')) {
                        inDtdBlock = true;
                    }
                    continue;
                }

                if (inDtdBlock) {
                    block.directives.push(directive);
                }
            }

            return block;
        }

    /**
         * 提取单行XML DTD 指令并返回匹配结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回提取到的 DTD 指令
         */
        protected static extractXmlDtdDirectiveFromLine(line: string): XmlDtdDirective | null {
            const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
            const trimmed = lineWithoutComments.trim();

            if (
                trimmed.length === 0
                || trimmed.startsWith('<!--')
                || trimmed.startsWith('<![CDATA[')
                || !trimmed.startsWith('<!')
            ) {
                return null;
            }

            const conditionalMatch = trimmed.match(/^<!\[\s*(INCLUDE|IGNORE)\s*\[([\s\S]*)$/i);
            if (conditionalMatch) {
                return {
                    key: `!${conditionalMatch[1].toUpperCase()}`,
                    value: conditionalMatch[2].trim().replace(/\]\]>\s*$/, '').trim(),
                };
            }

            const match = trimmed.match(/^<!\s*([A-Za-z][\w:-]*)\b([\s\S]*)$/);
            if (!match) {
                return null;
            }

            const directiveName = match[1].toUpperCase();
            const directiveBody = match[2].trim().replace(/>\s*$/, '').trim();
            return {
                key: `!${directiveName}`,
                value: directiveBody,
            };
        }

    /**
         * 合并XML DTD 指令到解析结果供后续流程复用
         * @param value - 解析后的 XML 数据
         * @param topLevelPiKeys - 顶层处理指令键列表
         * @param dtdBlock - 提取到的 DTD 结构
         * @returns 返回合并后的 XML 数据
         */
        protected static attachXmlDtdDirectives(value: unknown, topLevelPiKeys: string[], dtdBlock: XmlDtdBlock): unknown {
            const hasDoctype = dtdBlock.doctype !== null;
            const hasTopLevelPi = topLevelPiKeys.length > 0;
            if (!hasDoctype && !hasTopLevelPi) {
                return value;
            }

            const merged: Record<string, unknown> = {};
            const consumedPiKey = new Set<string>();

            const attachPreludeToMerged = (target: Record<string, unknown>): void => {
                for (const key of topLevelPiKeys) {
                    if (consumedPiKey.has(key) || !Object.prototype.hasOwnProperty.call(target, key)) {
                        continue;
                    }
                    merged[key] = target[key];
                    consumedPiKey.add(key);
                }
            };

            const buildDoctypeValue = (): unknown => {
                if (!dtdBlock.doctype) {
                    return undefined;
                }

                if (dtdBlock.directives.length === 0) {
                    return dtdBlock.doctype.value;
                }

                const nested: Record<string, unknown> = {};
                const declaration = dtdBlock.doctype.value.replace(/\[\s*$/, '').trim();
                if (declaration.length > 0) {
                    nested[this.XML_DECLARATION_KEY] = declaration;
                }

                for (const directive of dtdBlock.directives) {
                    const existing = nested[directive.key];
                    if (existing === undefined) {
                        nested[directive.key] = directive.value;
                        continue;
                    }
                    nested[directive.key] = `${String(existing)} | ${directive.value}`;
                }

                return nested;
            };

            const doctypeValue = buildDoctypeValue();
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const normalized = value as Record<string, unknown>;
                attachPreludeToMerged(normalized);

                if (hasDoctype && doctypeValue !== undefined) {
                    merged['!DOCTYPE'] = doctypeValue;
                }

                for (const [key, normalizedValue] of Object.entries(normalized)) {
                    if (consumedPiKey.has(key)) {
                        continue;
                    }
                    merged[key] = normalizedValue;
                }

                return merged;
            }

            if (hasDoctype && doctypeValue !== undefined) {
                merged['!DOCTYPE'] = doctypeValue;
            }

            if (value === null || value === undefined) {
                return merged;
            }

            if (value && typeof value === 'object' && Array.isArray(value)) {
                return {
                    ...merged,
                    '#document': value,
                };
            }

            return {
                ...merged,
                '#document': value,
            };
        }

    /**
         * 归一化XML值以统一后续处理
         * @param value - 待处理的值
         * @returns 返回归一化后的 XML 数据
         */
        protected static normalizeXmlValue(value: unknown): unknown {
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
                        others.push([key.toUpperCase(), text]);
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
                    continue;
                }

                const normalizedElementValue = this.normalizeXmlElementNodeValue(key, next);
                if (normalizedElementValue === undefined) {
                    continue;
                }

                if (Array.isArray(normalizedElementValue) && normalizedElementValue.length === 0) {
                    continue;
                }

                others.push([key, normalizedElementValue]);
            }

            const normalized: Record<string, unknown> = {};
            for (const [key, val] of [...attributes, ...others]) {
                normalized[key] = val;
            }

            return normalized;
        }

    /**
         * 归一化XML 元素节点值以统一后续处理
         * @param key - 当前处理的键名
         * @param value - 待处理的值
         * @returns 返回归一化后的节点值
         */
        protected static normalizeXmlElementNodeValue(key: string, value: unknown): unknown {
            if (this.isXmlMetaKey(key)) {
                return value;
            }

            if (Array.isArray(value)) {
                return value.map(item => this.wrapXmlTextNodeIfPrimitive(item));
            }

            return this.wrapXmlTextNodeIfPrimitive(value);
        }

    /**
         * 判断XML 元数据键是否成立
         * @param key - 当前处理的键名
         * @returns 返回布尔判断结果
         */
        protected static isXmlMetaKey(key: string): boolean {
            return key.startsWith('!') || key.startsWith('?') || key.startsWith('#');
        }

    /**
         * 将XML 元素原始值包装为文本节点对象
         * @param value - 待处理的值
         * @returns 返回包装后的值
         */
        protected static wrapXmlTextNodeIfPrimitive(value: unknown): unknown {
            if (value === null || value === undefined) {
                return value;
            }

            if (Array.isArray(value) || typeof value === 'object') {
                return value;
            }

            const text = String(value).trim();
            if (text.length === 0) {
                return value;
            }

            return {
                [this.XML_TEXT_KEY]: text,
            };
        }

    /**
         * 判断XML 类文本键是否成立
         * @param key - 当前处理的键名
         * @returns 返回布尔判断结果
         */
        protected static isXmlTextLikeKey(key: string): boolean {
            const normalizedKey = key.toUpperCase();
            return normalizedKey === this.XML_TEXT_KEY || normalizedKey === this.XML_CDATA_KEY;
        }

    /**
         * 判断XML 属性键是否成立
         * @param key - 当前处理的键名
         * @returns 返回布尔判断结果
         */
        protected static isXmlAttributeKey(key: string): boolean {
            return key.startsWith('@');
        }

    /**
         * 提取XML 键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 XML 行中提取到的键名列表
         */
        protected static extractXmlKeys(line: string): string[] {
            const keys: string[] = [];
            keys.push(...this.extractXmlDtdDirectiveKeys(line));
            keys.push(...this.extractXmlProcessingInstructionKeys(line));
            const matches = this.extractXmlTagMatches(line);

            for (const match of matches) {
                keys.push(match.tagName);
                keys.push(...this.extractXmlAttributeKeys(match.attributesSource));
            }

            if (matches.length === 0) {
                keys.push(...this.extractXmlMultilineAttributeKeys(line));
            }

            return keys;
        }

    /**
         * 提取XML 处理指令键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 XML 行中提取到的处理指令键列表
         */
        protected static extractXmlProcessingInstructionKeys(line: string): string[] {
            const keys: string[] = [];
            const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
            const pattern = /<\?\s*([A-Za-z_:][\w:.-]*)\b[\s\S]*?\?>/g;

            let match: RegExpExecArray | null;
            while ((match = pattern.exec(lineWithoutComments)) !== null) {
                keys.push(`?${match[1]}`);
            }

            return keys;
        }

    /**
         * 提取XML DTD 指令键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 XML 行中提取到的 DTD 指令键列表
         */
        protected static extractXmlDtdDirectiveKeys(line: string): string[] {
            const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
            const trimmed = lineWithoutComments.trim();
            if (
                trimmed.length === 0
                || trimmed.startsWith('<!--')
                || trimmed.startsWith('<![CDATA[')
            ) {
                return [];
            }

            const conditionalMatch = trimmed.match(/^<!\[\s*(INCLUDE|IGNORE)\s*\[/i);
            if (conditionalMatch) {
                return [`!${conditionalMatch[1].toUpperCase()}`];
            }

            const match = trimmed.match(/^<!\s*([A-Za-z][\w:-]*)\b/);
            if (!match) {
                return [];
            }

            const directiveKey = `!${match[1].toUpperCase()}`;
            if (directiveKey === '!DOCTYPE') {
                return [directiveKey, this.XML_DECLARATION_KEY];
            }

            return [directiveKey];
        }

    /**
         * 提取XML 标签匹配供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 XML 标签匹配结果集合
         */
        protected static extractXmlTagMatches(line: string): XmlTagMatch[] {
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
         * @param attributesSource - XML 标签中的属性原始文本
         * @returns 返回 XML 属性键名列表
         */
        protected static extractXmlAttributeKeys(attributesSource: string): string[] {
            const keys: string[] = [];
            const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;

            let match: RegExpExecArray | null;
            while ((match = pattern.exec(attributesSource)) !== null) {
                keys.push(`@${match[1]}`);
            }

            return keys;
        }

    /**
         * 提取XML 多行起始标签延续行中的属性键
         * @param line - 当前处理的行内容或行号
         * @returns 返回 XML 行中提取到的属性键列表
         */
        protected static extractXmlMultilineAttributeKeys(line: string): string[] {
            const lineWithoutComments = line.replace(/<!--.*?-->/g, ' ');
            const trimmed = lineWithoutComments.trim();
            if (!this.isXmlAttributeContinuationLine(trimmed)) {
                return [];
            }

            return this.extractXmlAttributeKeys(trimmed);
        }

    /**
         * 判断行是否为 XML 多行起始标签的属性延续行
         * @param trimmedLine - 去除首尾空白后的行文本
         * @returns 返回布尔判断结果
         */
        protected static isXmlAttributeContinuationLine(trimmedLine: string): boolean {
            if (
                trimmedLine.length === 0
                || trimmedLine.startsWith('<')
                || trimmedLine.startsWith('<?')
                || trimmedLine.startsWith('<!')
            ) {
                return false;
            }

            return /([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/.test(trimmedLine);
        }

    /**
         * 构建XML 文本类键行集合供后续流程复用
         * @param key - 当前处理的键名
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的行号集合
         */
        protected static buildXmlTextLikeKeyLines(key: string, lines: string[]): number[] {
            const matches: number[] = [];
            const normalizedKey = key.toUpperCase();
            let inDtdBlock = false;

            for (let i = 0; i < lines.length; i++) {
                const lineWithoutComments = lines[i].replace(/<!--.*?-->/g, ' ');
                const trimmed = lineWithoutComments.trim();

                if (!inDtdBlock && /^<!DOCTYPE\b/i.test(trimmed)) {
                    if (trimmed.includes('[') && !trimmed.includes(']>')) {
                        inDtdBlock = true;
                    }
                    continue;
                }

                if (inDtdBlock) {
                    if (trimmed.includes(']>')) {
                        inDtdBlock = false;
                    }
                    continue;
                }

                if (/^<!/.test(trimmed)) {
                    continue;
                }

                if (normalizedKey === this.XML_CDATA_KEY) {
                    if (lines[i].includes('<![CDATA[')) {
                        matches.push(i);
                    }
                    continue;
                }

                if (normalizedKey === this.XML_TEXT_KEY && this.lineContainsXmlTextContent(lines[i])) {
                    matches.push(i);
                }
            }

            return matches;
        }

    /**
         * 判断行内是否包含可绑定的 XML 文本内容
         * @param line - 当前处理的行内容或行号
         * @returns 返回布尔判断结果
         */
        protected static lineContainsXmlTextContent(line: string): boolean {
            if (line.includes('<![CDATA[')) {
                return false;
            }

            const withoutComments = line.replace(/<!--.*?-->/g, ' ');
            if (this.isXmlAttributeContinuationLine(withoutComments.trim())) {
                return false;
            }
            const withoutTags = withoutComments.replace(/<[^>]*>/g, ' ');
            return withoutTags.trim().length > 0;
        }

    /**
         * 构建XML注释元数据供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildXmlCommentMetadata(lines: string[]): CommentMetadata {
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
                const bindableLine = this.hasXmlBindableKeysForComments(scan.nonCommentText);
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
         * 判断 XML 行是否可绑定注释
         * @param line - 当前处理的行内容或行号
         * @returns 返回布尔判断结果
         */
        protected static hasXmlBindableKeysForComments(line: string): boolean {
            if (this.extractXmlTagMatches(line).length > 0) {
                return true;
            }

            return this.extractXmlMultilineAttributeKeys(line).length > 0;
        }

    /**
         * 扫描XML行注释集合并提取片段
         * @param line - 当前处理的行内容或行号
         * @param state - XML 注释扫描状态
         * @returns 返回 XML 行注释扫描结果
         */
        protected static scanXmlLineComments(line: string, state: XmlCommentScanState): XmlLineCommentScanResult {
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
         * 统计XML 元素深度增量用于流程判断
         * @param nonCommentText - 剔除注释后的 XML 文本
         * @returns 返回布尔判断结果
         */
        protected static countXmlElementDepthDelta(nonCommentText: string): number {
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
     * 处理XML注释文本相关逻辑并返回结果
     * @param text - 待处理的文本内容
     * @returns 返回清洗后的 XML 注释文本
     */
    protected static cleanXmlCommentText(text: string): string {
        return text
            .split('\n')
            .map(line => line.replace(/\r/g, '').trim())
            .join('\n')
            .trim();
    }
}
