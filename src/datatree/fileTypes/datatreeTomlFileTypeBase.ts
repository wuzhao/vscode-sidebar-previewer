import { DatatreeYamlFileTypeBase } from './datatreeYamlFileTypeBase';

/**
 * 提供 TOML 数据树能力
 */
export class DatatreeTomlFileTypeBase extends DatatreeYamlFileTypeBase {
    /**
         * 构建TOML路径行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildTomlPathLineIndex(lines: string[]): Map<string, number[]> {
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
         * 构建TOML数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildTomlArrayItemLineIndex(lines: string[]): number[] {
            const result: number[] = [];
            let arrayDepth = 0;

            for (let i = 0; i < lines.length; i++) {
                const codeLine = this.stripHashCommentText(lines[i]);
                const trimmed = codeLine.trim();
                if (trimmed.length === 0) {
                    continue;
                }

                if (/^\s*\[\[.*\]\]\s*$/.test(trimmed)) {
                    result.push(i);
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

                if (/^\s*\[.*\]\s*$/.test(trimmed)) {
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

                const arraySegment = rhs.slice(arrayStart);
                const inlineItemCount = this.countTomlTopLevelArrayItems(arraySegment);
                for (let count = 0; count < inlineItemCount; count++) {
                    result.push(i);
                }

                arrayDepth = this.countSquareBracketDelta(arraySegment);
                if (arrayDepth < 0) {
                    arrayDepth = 0;
                }
            }

            return result;
        }

    /**
         * 构建TOML 数组起始行深度供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildTomlArrayDepthAtLineStart(lines: string[]): number[] {
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
         * 查找TOML 数组元素首个标记并返回匹配结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findTomlArrayItemFirstToken(line: string): string | null {
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
         * @param text - 待处理的文本内容
         * @returns 返回匹配结果
         */
        protected static findTomlArrayStart(text: string): number {
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
         * 统计 TOML 顶层数组项数量并返回结果
         * @param arraySegment - 以 `[` 开始的数组片段
         * @returns 返回数组项数量
         */
        protected static countTomlTopLevelArrayItems(arraySegment: string): number {
            let inSingle = false;
            let inDouble = false;
            let escape = false;
            let squareDepth = 0;
            let curlyDepth = 0;
            let itemStarted = false;
            let count = 0;

            for (let i = 0; i < arraySegment.length; i++) {
                const ch = arraySegment[i];

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
                    if (squareDepth > 0) {
                        itemStarted = true;
                    }
                    continue;
                }

                if (ch === '\'') {
                    inSingle = true;
                    if (squareDepth > 0) {
                        itemStarted = true;
                    }
                    continue;
                }

                if (ch === '[') {
                    squareDepth += 1;
                    if (squareDepth > 1) {
                        itemStarted = true;
                    }
                    continue;
                }

                if (ch === ']') {
                    squareDepth -= 1;
                    if (squareDepth <= 0) {
                        if (itemStarted) {
                            count += 1;
                            itemStarted = false;
                        }
                        break;
                    }
                    continue;
                }

                if (squareDepth === 0) {
                    continue;
                }

                if (ch === '{') {
                    curlyDepth += 1;
                    if (squareDepth >= 1) {
                        itemStarted = true;
                    }
                    continue;
                }

                if (ch === '}') {
                    if (curlyDepth > 0) {
                        curlyDepth -= 1;
                    }
                    if (squareDepth >= 1) {
                        itemStarted = true;
                    }
                    continue;
                }

                if (ch === ',' && squareDepth === 1 && curlyDepth === 0) {
                    if (itemStarted) {
                        count += 1;
                        itemStarted = false;
                    }
                    continue;
                }

                if (!/\s/.test(ch)) {
                    itemStarted = true;
                }
            }

            if (itemStarted) {
                count += 1;
            }

            return count;
        }

    /**
         * 统计方括号深度增量用于流程判断
         * @param line - 当前处理的行内容或行号
         * @returns 返回布尔判断结果
         */
        protected static countSquareBracketDelta(line: string): number {
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
         * 提取TOML 键供后续逻辑使用
         * @param line - 当前处理的行内容或行号
         * @returns 返回 TOML 行中提取到的键名列表
         */
        protected static extractTomlKeys(line: string): string[] {
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
         * 拆分TOML路径并返回片段集合
         * @param pathExpr - TOML 路径表达式
         * @returns 返回片段集合
         */
        protected static splitTomlPath(pathExpr: string): string[] {
            return pathExpr
                .split('.')
                .map(segment => segment.trim().replace(/^["']|["']$/g, ''))
                .filter(Boolean);
        }
}
