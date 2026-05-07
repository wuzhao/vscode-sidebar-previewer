import { DatatreeYamlFileTypeBase } from './datatreeYamlFileTypeBase';

type TomlCursor = {
    line: number;
    column: number;
};

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

                const equalIndex = this.findTomlAssignmentEqualIndex(codeLine);
                if (equalIndex < 0) {
                    continue;
                }

                const valueExpr = codeLine.slice(equalIndex + 1);
                const inlineTableKeys = this.extractTomlInlineTableTopLevelKeys(valueExpr);
                if (inlineTableKeys.length === 0) {
                    continue;
                }

                const basePath = [...currentTablePath, ...relativePath];
                inlineTableKeys.forEach(inlineKey => {
                    pushPath([...basePath, inlineKey], i, true);
                });
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
         * 提取TOML 内联表顶层键集合供路径定位复用
         * @param valueExpr - 赋值右侧原始表达式
         * @returns 返回内联表顶层键集合
         */
        protected static extractTomlInlineTableTopLevelKeys(valueExpr: string): string[] {
            const source = valueExpr.trim();
            if (!source.startsWith('{')) {
                return [];
            }

            const keys: string[] = [];
            let cursor = 1;

            const skipWhitespace = (): void => {
                while (cursor < source.length && /\s/.test(source[cursor])) {
                    cursor += 1;
                }
            };

            const readQuotedKey = (quote: '"' | "'"): string => {
                cursor += 1;
                let key = '';
                let escaped = false;
                while (cursor < source.length) {
                    const ch = source[cursor];
                    cursor += 1;

                    if (quote === '"' && escaped) {
                        key += ch;
                        escaped = false;
                        continue;
                    }

                    if (quote === '"' && ch === '\\') {
                        escaped = true;
                        continue;
                    }

                    if (ch === quote) {
                        break;
                    }

                    key += ch;
                }

                return key.trim();
            };

            const readBareKey = (): string => {
                const start = cursor;
                while (cursor < source.length) {
                    const ch = source[cursor];
                    if (ch === '=' || ch === ',' || ch === '}' || /\s/.test(ch)) {
                        break;
                    }
                    cursor += 1;
                }

                return source.slice(start, cursor).trim();
            };

            const skipValue = (): void => {
                let inSingle = false;
                let inDouble = false;
                let escaped = false;
                let squareDepth = 0;
                let curlyDepth = 0;

                while (cursor < source.length) {
                    const ch = source[cursor];

                    if (inDouble) {
                        cursor += 1;
                        if (escaped) {
                            escaped = false;
                            continue;
                        }
                        if (ch === '\\') {
                            escaped = true;
                            continue;
                        }
                        if (ch === '"') {
                            inDouble = false;
                        }
                        continue;
                    }

                    if (inSingle) {
                        cursor += 1;
                        if (ch === "'") {
                            inSingle = false;
                        }
                        continue;
                    }

                    if (ch === '"') {
                        inDouble = true;
                        cursor += 1;
                        continue;
                    }

                    if (ch === "'") {
                        inSingle = true;
                        cursor += 1;
                        continue;
                    }

                    if (ch === '[') {
                        squareDepth += 1;
                        cursor += 1;
                        continue;
                    }

                    if (ch === ']') {
                        if (squareDepth > 0) {
                            squareDepth -= 1;
                        }
                        cursor += 1;
                        continue;
                    }

                    if (ch === '{') {
                        curlyDepth += 1;
                        cursor += 1;
                        continue;
                    }

                    if (ch === '}') {
                        if (curlyDepth > 0) {
                            curlyDepth -= 1;
                            cursor += 1;
                            continue;
                        }
                        return;
                    }

                    if (ch === ',' && squareDepth === 0 && curlyDepth === 0) {
                        return;
                    }

                    cursor += 1;
                }
            };

            while (cursor < source.length) {
                skipWhitespace();
                if (cursor >= source.length || source[cursor] === '}') {
                    break;
                }

                let key = '';
                if (source[cursor] === '"' || source[cursor] === "'") {
                    key = readQuotedKey(source[cursor] as '"' | "'");
                } else {
                    key = readBareKey();
                }

                skipWhitespace();
                if (cursor >= source.length || source[cursor] !== '=') {
                    while (cursor < source.length && source[cursor] !== ',' && source[cursor] !== '}') {
                        cursor += 1;
                    }
                } else {
                    if (key.length > 0) {
                        keys.push(key);
                    }
                    cursor += 1;
                    skipValue();
                }

                if (cursor < source.length && source[cursor] === ',') {
                    cursor += 1;
                    continue;
                }

                if (cursor < source.length && source[cursor] === '}') {
                    break;
                }
            }

            return keys;
        }

    /**
         * 构建TOML数组元素行索引供后续流程复用
         * @param lines - 按行拆分后的源文本
         * @returns 返回构建后的数据结构
         */
        protected static buildTomlArrayItemLineIndex(lines: string[]): number[] {
            const result: number[] = [];
            const codeLines = lines.map(line => this.stripHashCommentText(line));

            for (let i = 0; i < codeLines.length; i++) {
                const codeLine = codeLines[i];
                const trimmed = codeLine.trim();
                if (trimmed.length === 0) {
                    continue;
                }

                if (/^\s*\[\[.*\]\]\s*$/.test(trimmed)) {
                    result.push(i);
                    continue;
                }

                if (/^\s*\[.*\]\s*$/.test(trimmed)) {
                    continue;
                }

                const equalIndex = this.findTomlAssignmentEqualIndex(codeLine);
                if (equalIndex < 0) {
                    continue;
                }

                const cursor: TomlCursor = {
                    line: i,
                    column: equalIndex + 1,
                };
                this.collectTomlArrayItemLinesFromValue(codeLines, cursor, result);
                if (cursor.line > i) {
                    i = Math.min(cursor.line, codeLines.length - 1);
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
         * 查找TOML 赋值语句等号位置并返回匹配结果
         * @param line - 当前处理的行内容或行号
         * @returns 返回匹配结果
         */
        protected static findTomlAssignmentEqualIndex(line: string): number {
            let inSingle = false;
            let inDouble = false;
            let escape = false;
            let squareDepth = 0;
            let curlyDepth = 0;

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
                    squareDepth += 1;
                    continue;
                }
                if (ch === ']') {
                    squareDepth = Math.max(0, squareDepth - 1);
                    continue;
                }
                if (ch === '{') {
                    curlyDepth += 1;
                    continue;
                }
                if (ch === '}') {
                    curlyDepth = Math.max(0, curlyDepth - 1);
                    continue;
                }
                if (ch === '=' && squareDepth === 0 && curlyDepth === 0) {
                    return i;
                }
            }

            return -1;
        }

    /**
         * 递归提取 TOML 值中的数组元素行并写入结果
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @param result - 数组元素行结果集合
         */
        protected static collectTomlArrayItemLinesFromValue(
            lines: string[],
            cursor: TomlCursor,
            result: number[]
        ): void {
            this.skipTomlCursorWhitespace(lines, cursor, true);
            const ch = this.peekTomlCursorChar(lines, cursor);
            if (!ch) {
                return;
            }

            if (ch === '[') {
                this.collectTomlArrayItemLinesFromArray(lines, cursor, result);
                return;
            }

            if (ch === '{') {
                this.collectTomlArrayItemLinesFromInlineTable(lines, cursor, result);
                return;
            }

            if (ch === '"' || ch === '\'') {
                this.consumeTomlQuotedString(lines, cursor, ch);
                return;
            }

            this.consumeTomlBareValue(lines, cursor);
        }

    /**
         * 递归提取 TOML 数组值中的元素行并写入结果
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @param result - 数组元素行结果集合
         */
        protected static collectTomlArrayItemLinesFromArray(
            lines: string[],
            cursor: TomlCursor,
            result: number[]
        ): void {
            if (this.peekTomlCursorChar(lines, cursor) !== '[') {
                return;
            }
            this.advanceTomlCursor(lines, cursor);

            while (true) {
                this.skipTomlCursorWhitespace(lines, cursor, true);
                const ch = this.peekTomlCursorChar(lines, cursor);

                if (!ch) {
                    return;
                }

                if (ch === ']') {
                    this.advanceTomlCursor(lines, cursor);
                    return;
                }

                if (ch === ',') {
                    this.advanceTomlCursor(lines, cursor);
                    continue;
                }

                result.push(cursor.line);
                this.collectTomlArrayItemLinesFromValue(lines, cursor, result);
                this.skipTomlCursorWhitespace(lines, cursor, true);

                const separator = this.peekTomlCursorChar(lines, cursor);
                if (separator === ',') {
                    this.advanceTomlCursor(lines, cursor);
                    continue;
                }

                if (separator === ']') {
                    this.advanceTomlCursor(lines, cursor);
                    return;
                }

                if (!separator) {
                    return;
                }

                this.advanceTomlCursor(lines, cursor);
            }
        }

    /**
         * 递归提取 TOML 内联表中的数组元素行并写入结果
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @param result - 数组元素行结果集合
         */
        protected static collectTomlArrayItemLinesFromInlineTable(
            lines: string[],
            cursor: TomlCursor,
            result: number[]
        ): void {
            if (this.peekTomlCursorChar(lines, cursor) !== '{') {
                return;
            }
            this.advanceTomlCursor(lines, cursor);

            while (true) {
                this.skipTomlCursorWhitespace(lines, cursor, true);
                const ch = this.peekTomlCursorChar(lines, cursor);

                if (!ch) {
                    return;
                }

                if (ch === '}') {
                    this.advanceTomlCursor(lines, cursor);
                    return;
                }

                if (ch === ',') {
                    this.advanceTomlCursor(lines, cursor);
                    continue;
                }

                this.consumeTomlInlineTableKey(lines, cursor);
                this.skipTomlCursorWhitespace(lines, cursor, true);

                if (this.peekTomlCursorChar(lines, cursor) === '=') {
                    this.advanceTomlCursor(lines, cursor);
                    this.collectTomlArrayItemLinesFromValue(lines, cursor, result);
                }

                this.skipTomlCursorWhitespace(lines, cursor, true);
                const separator = this.peekTomlCursorChar(lines, cursor);
                if (separator === ',') {
                    this.advanceTomlCursor(lines, cursor);
                    continue;
                }
                if (separator === '}') {
                    this.advanceTomlCursor(lines, cursor);
                    return;
                }
                if (!separator) {
                    return;
                }

                this.advanceTomlCursor(lines, cursor);
            }
        }

    /**
         * 处理 TOML 内联表键消费逻辑
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         */
        protected static consumeTomlInlineTableKey(lines: string[], cursor: TomlCursor): void {
            this.skipTomlCursorWhitespace(lines, cursor, true);
            const ch = this.peekTomlCursorChar(lines, cursor);
            if (!ch) {
                return;
            }

            if (ch === '"' || ch === '\'') {
                this.consumeTomlQuotedString(lines, cursor, ch);
                return;
            }

            while (true) {
                const current = this.peekTomlCursorChar(lines, cursor);
                if (!current || current === '=' || current === ',' || current === '}' || current === '\n' || /\s/.test(current)) {
                    return;
                }
                this.advanceTomlCursor(lines, cursor);
            }
        }

    /**
         * 处理 TOML 引号字符串消费逻辑
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @param quote - 引号类型
         */
        protected static consumeTomlQuotedString(lines: string[], cursor: TomlCursor, quote: '"' | '\''): void {
            if (this.peekTomlCursorChar(lines, cursor) !== quote) {
                return;
            }

            this.advanceTomlCursor(lines, cursor);
            let escaped = false;

            while (true) {
                const ch = this.peekTomlCursorChar(lines, cursor);
                if (!ch) {
                    return;
                }

                this.advanceTomlCursor(lines, cursor);

                if (quote === '"') {
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                }

                if (ch === quote) {
                    return;
                }
            }
        }

    /**
         * 处理 TOML 裸值消费逻辑
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         */
        protected static consumeTomlBareValue(lines: string[], cursor: TomlCursor): void {
            while (true) {
                const ch = this.peekTomlCursorChar(lines, cursor);
                if (!ch || ch === ',' || ch === ']' || ch === '}' || ch === '\n' || /\s/.test(ch)) {
                    return;
                }
                this.advanceTomlCursor(lines, cursor);
            }
        }

    /**
         * 处理 TOML 游标空白跳过逻辑
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @param includeNewline - 是否跳过换行
         */
        protected static skipTomlCursorWhitespace(lines: string[], cursor: TomlCursor, includeNewline: boolean): void {
            while (true) {
                const ch = this.peekTomlCursorChar(lines, cursor);
                if (!ch) {
                    return;
                }
                if (ch === '\n' && !includeNewline) {
                    return;
                }
                if (ch !== '\n' && !/\s/.test(ch)) {
                    return;
                }
                this.advanceTomlCursor(lines, cursor);
            }
        }

    /**
         * 读取 TOML 游标当前字符并返回结果
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         * @returns 返回当前字符
         */
        protected static peekTomlCursorChar(lines: string[], cursor: TomlCursor): string | null {
            if (cursor.line < 0 || cursor.line >= lines.length) {
                return null;
            }

            const line = lines[cursor.line];
            if (cursor.column < line.length) {
                return line[cursor.column];
            }

            return cursor.line + 1 < lines.length ? '\n' : null;
        }

    /**
         * 推进 TOML 游标并返回下一位置
         * @param lines - 去注释后的源码行集合
         * @param cursor - 当前游标
         */
        protected static advanceTomlCursor(lines: string[], cursor: TomlCursor): void {
            if (cursor.line < 0 || cursor.line >= lines.length) {
                return;
            }

            const line = lines[cursor.line];
            if (cursor.column < line.length) {
                cursor.column += 1;
                return;
            }

            cursor.line += 1;
            cursor.column = 0;
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
