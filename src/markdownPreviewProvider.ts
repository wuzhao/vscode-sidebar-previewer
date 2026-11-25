import { Marked, Renderer, type Token, type Tokens } from 'marked';
import hljs from 'highlight.js';
import * as yaml from 'js-yaml';
import { HeadingInfo } from './fileTypes';
import { escapeHtml, generateHeadingId } from './utils';

// 单个代码块参与自动语言识别的最大字符数
const MAX_AUTO_HIGHLIGHT_BLOCK_LENGTH = 2048;
// 单篇 Markdown 允许自动识别的代码字符总数
const MAX_AUTO_HIGHLIGHT_DOCUMENT_LENGTH = 8192;

// Markdown 表格单元格开头的 Task List 标记
const MARKDOWN_TABLE_TASK_PATTERN = /^-\s+\[([ xX])\](?:\s+|$)/;
// Markdown 表格源码中 Task List 标记之前的单元格前缀
const MARKDOWN_TABLE_TASK_SOURCE_PREFIX_PATTERN = /^(\s*-\s+)(?=\[[ xX]\](?:\s+|$))/;

/**
 * Markdown 表格 Task List 标记在源文档中的定位信息
 */
interface MarkdownTableTaskLocation {
    line: number;
    character: number;
    sourceLine: number;
    sourceCharacter: number;
}

/**
 * Markdown 标题在源文档中的候选位置
 */
interface MarkdownHeadingSource {
    level: number;
    text: string;
    line: number;
}

/**
 * 提供 Markdown 相关预览能力
 */
export class MarkdownProvider {
    /**
     * 解析 Markdown 内容，返回 HTML 和标题信息
     * @param content - 待解析的文件内容
     * @returns 返回解析后的预览结果
     */
    static parse(content: string): { html: string; headings: HeadingInfo[] } {
        const headings: HeadingInfo[] = [];

        // 提取 front matter
        let frontMatterHtml = '';
        let bodyContent = content;
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
        if (fmMatch) {
            try {
                const fmData = yaml.load(fmMatch[1]);
                if (fmData && typeof fmData === 'object' && !Array.isArray(fmData)) {
                    frontMatterHtml = this.renderFrontMatterTable(fmData as Record<string, unknown>);
                }
            } catch (error) {
                console.warn('Sidebar Previewer: failed to parse front matter YAML', error);
            }
            bodyContent = content.slice(fmMatch[0].length);
        }

        const usedIds = new Map<string, number>();
        if (frontMatterHtml) {
            usedIds.set('frontmatter', 1);
        }
        const lines = content.split(/\r?\n/);
        const bodyStartLine = content.slice(0, content.length - bodyContent.length).split(/\r?\n/).length - 1;
        const headingSources = this.collectMarkdownHeadingSources(bodyContent, bodyStartLine);
        let headingSourceIndex = 0;

        let autoHighlightRemaining = MAX_AUTO_HIGHLIGHT_DOCUMENT_LENGTH;

        // 配置 marked
        const renderer = new Renderer();
        let taskIndex = 0;
        const markdownTableData: string[] = [];
        let markdownTableIndex = 0;
        const markdownTableTaskLocations: Array<MarkdownTableTaskLocation | null> = [];
        let markdownTableCellIndex = 0;

        renderer.checkbox = function (checked: boolean): string {
            const location = taskLocations[taskIndex++];
            return '<input type="checkbox"'
                + (checked ? ' checked=""' : '')
                + (location ? ` data-line="${location.line}" data-char="${location.character}"` : ' disabled')
                + '>';
        };

        renderer.listitem = function (text: string, task: boolean, _checked: boolean): string {
            if (task) {
                return '<li class="task-list-item">' + text + '</li>\n';
            }
            return '<li>' + text + '</li>\n';
        };

        renderer.tablecell = function (
            content: string,
            flags: { header: boolean; align: 'center' | 'left' | 'right' | null }
        ): string {
            const taskLocation = markdownTableTaskLocations[markdownTableCellIndex++] ?? null;
            const type = flags.header ? 'th' : 'td';
            const tag = flags.align ? `<${type} align="${flags.align}">` : `<${type}>`;
            const cellContent = flags.header
                ? content
                : MarkdownProvider.renderTableTaskCheckbox(content, taskLocation);
            return tag + cellContent + `</${type}>\n`;
        };

        renderer.table = function (header: string, body: string): string {
            const tableData = markdownTableData[markdownTableIndex++] || '';
            const tableDataAttr = tableData
                ? ` data-markdown-table="${escapeHtml(tableData)}"`
                : '';
            const tableBody = body ? `<tbody>${body}</tbody>` : '';
            return `<table${tableDataAttr}>\n`
                + '<thead>\n'
                + header
                + '</thead>\n'
                + tableBody
                + '</table>\n';
        };

        renderer.blockquote = quote => this.renderBlockquote(quote);

        let headingIndex = 0;
        renderer.heading = function (text: string, level: number, _raw: string): string {
            const heading = headings[headingIndex++];
            const id = heading?.id || `heading-${headingIndex}`;
            return `<h${level} id="${id}">${text}</h${level}>\n`;
        };

        renderer.code = function (code: string, infostring: string | undefined): string {
            const lang = (infostring || '').match(/^\S*/)?.[0] || '';
            if (lang === 'mermaid') {
                return `<div class="mermaid mermaid-block">${escapeHtml(code)}</div>\n`;
            }
            if (lang === 'math') {
                return `<div class="katex-block" data-katex-display="true">${escapeHtml(code)}</div>\n`;
            }
            let highlighted: string;
            if (lang && hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(code, { language: lang }).value;
            } else if (code.length > 0 && code.length <= MAX_AUTO_HIGHLIGHT_BLOCK_LENGTH && code.length <= autoHighlightRemaining) {
                autoHighlightRemaining -= code.length;
                highlighted = hljs.highlightAuto(code).value;
            } else {
                highlighted = escapeHtml(code);
            }
            const langClass = lang ? ` language-${escapeHtml(lang)}` : '';
            return `<pre><code class="hljs${langClass}">${highlighted}\n</code></pre>\n`;
        };

        // 扩展：支持 $$...$$ 行内数学语法
        const mathExtension: any = {
            name: 'mathInline',
            level: 'inline',
            // 定位行内数学公式的起始位置
            start(src: string) { return src.match(/\$\$/)?.index; },
            // 将 $$...$$ 片段解析为行内数学标记
            tokenizer(src: string) {
                const rule = /^\$\$([\s\S]+?)\$\$/;
                const match = rule.exec(src);
                if (match) {
                    return {
                        type: 'mathInline',
                        raw: match[0],
                        text: match[1]
                    };
                }
            },
            // 输出行内 KaTeX 占位标记，交由前端统一渲染
            renderer(token: any) {
                return `<span class="katex-inline" data-katex-display="false">${escapeHtml(token.text)}</span>`;
            }
        };

        // 扩展：支持 \begin{...}...\end{...} 块级数学语法
        const mathBlockExtension: any = {
            name: 'mathBlock',
            level: 'block',
            // 定位块级数学公式的起始位置
            start(src: string) { return src.match(/\\begin\{([a-zA-Z*]+)\}/)?.index; },
            // 将 begin/end 包裹的片段解析为块级数学标记
            tokenizer(src: string) {
                const rule = /^\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/;
                const match = rule.exec(src);
                if (match) {
                    return {
                        type: 'mathBlock',
                        raw: match[0],
                        text: match[0]
                    };
                }
            },
            // 输出块级 KaTeX 占位标记，交由前端统一渲染
            renderer(token: any) {
                return `<div class="katex-block" data-katex-display="true">${escapeHtml(token.text)}</div>\n`;
            }
        };

        const parser = new Marked();
        parser.setOptions({
            gfm: true,
            breaks: true,
            renderer,
        });
        parser.use({ extensions: [mathExtension, mathBlockExtension] });

        // 解析 Markdown（不含 front matter），并保留 GFM 表格源码供复制使用
        const markdownTokens = parser.lexer(bodyContent);
        const { taskLocations, tableLines } = this.collectTaskLocations(markdownTokens, bodyContent, bodyStartLine, lines);
        parser.walkTokens(markdownTokens, token => {
            if (token.type === 'heading') {
                const headingToken = token as Tokens.Heading;
                const matchingSourceIndex = headingSources.findIndex((source, index) => {
                    return index >= headingSourceIndex
                        && source.level === headingToken.depth
                        && source.text === headingToken.text;
                });
                const source = matchingSourceIndex >= 0
                    ? headingSources[matchingSourceIndex]
                    : headingSources[headingSourceIndex];
                if (matchingSourceIndex >= 0) {
                    headingSourceIndex = matchingSourceIndex + 1;
                } else if (source) {
                    headingSourceIndex++;
                }
                const text = headingToken.text.trim();
                const id = generateHeadingId(text, usedIds);
                headings.push({
                    level: headingToken.depth,
                    text,
                    line: source?.line ?? bodyStartLine,
                    id,
                });
            }

            if (token.type === 'table') {
                const tableToken = token as Tokens.Table;
                const tableSourceLines = tableToken.raw.split(/\r?\n/);
                while (tableSourceLines.length > 0 && tableSourceLines[tableSourceLines.length - 1].trim() === '') {
                    tableSourceLines.pop();
                }
                const tableStartLine = tableLines.get(tableToken) ?? null;
                markdownTableTaskLocations.push(...this.collectMarkdownTableTaskLocations(
                    tableToken,
                    lines,
                    tableSourceLines,
                    tableStartLine
                ));
                markdownTableData.push(JSON.stringify({
                    source: tableToken.raw,
                    alignments: tableToken.align,
                }));
            }
        });
        let html = parser.parser(markdownTokens);

        // 在正文前插入 front matter 表格
        if (frontMatterHtml) {
            html = frontMatterHtml + html;
        }

        const locateHeadings = frontMatterHtml
            ? [{ level: 1, text: 'frontmatter', line: 0, id: 'frontmatter' }, ...headings]
            : headings;

        return { html, headings: locateHeadings };
    }

    /**
     * 收集 Marked 标题在 Markdown 源码中的候选行号
     * @param content - 不含 front matter 的 Markdown 正文
     * @param firstLine - 正文首行在完整文档中的行号
     * @returns 返回按源码顺序排列的标题候选位置
     */
    private static collectMarkdownHeadingSources(content: string, firstLine: number): MarkdownHeadingSource[] {
        const sources: MarkdownHeadingSource[] = [];
        const lines = content.split(/\r?\n/);
        let fenceMarker: string | null = null;
        let paragraphStartLine: number | null = null;
        let paragraphLines: string[] = [];

        lines.forEach((sourceLine, index) => {
            const line = this.stripMarkdownContainerPrefix(sourceLine);
            const fenceMatch = line.match(/^ {0,3}([`~]{3,})/);
            if (fenceMatch) {
                const marker = fenceMatch[1];
                if (!fenceMarker) {
                    fenceMarker = marker;
                } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
                    fenceMarker = null;
                }
                paragraphStartLine = null;
                paragraphLines = [];
                return;
            }

            if (fenceMarker) {
                return;
            }

            const atxMatch = line.match(/^ {0,3}(#{1,6})(?:[\t ]+|$)(.*)$/);
            if (atxMatch) {
                const text = atxMatch[2].replace(/[\t ]+#+[\t ]*$/, '').trim();
                sources.push({
                    level: atxMatch[1].length,
                    text,
                    line: firstLine + index,
                });
                paragraphStartLine = null;
                paragraphLines = [];
                return;
            }

            const setextMatch = line.match(/^ {0,3}(=+|-+)[\t ]*$/);
            if (setextMatch && paragraphStartLine !== null && paragraphLines.length > 0) {
                sources.push({
                    level: setextMatch[1][0] === '=' ? 1 : 2,
                    text: paragraphLines.join('\n'),
                    line: paragraphStartLine,
                });
                paragraphStartLine = null;
                paragraphLines = [];
                return;
            }

            if (line.trim().length === 0 || /^(?: {4}|\t)/.test(line)) {
                paragraphStartLine = null;
                paragraphLines = [];
                return;
            }

            if (paragraphStartLine === null) {
                paragraphStartLine = firstLine + index;
            }
            paragraphLines.push(line.trim());
        });

        return sources;
    }

    /**
     * 去除引用块与列表容器前缀以还原其中的 Markdown 块级语法
     * @param sourceLine - Markdown 源码中的单行文本
     * @returns 返回去除容器标记后的行内容
     */
    private static stripMarkdownContainerPrefix(sourceLine: string): string {
        let line = sourceLine;
        let previous = '';
        while (line !== previous) {
            previous = line;
            line = line.replace(/^ {0,3}>[\t ]?/, '');
            line = line.replace(/^ {0,3}(?:[*+-]|\d{1,9}[.)])[\t ]+/, '');
        }
        return line;
    }

    /**
     * 获取表格源码行在文档行中的字符偏移
     * 支持由引用标记包裹的 Markdown 表格
     * @param documentLine - Markdown 文档中的完整源码行
     * @param tableSourceLine - 解析器提供的表格源码行
     * @returns 表格源码的起始字符，无法匹配时返回 null
     */
    private static getMarkdownTableLineContentOffset(
        documentLine: string,
        tableSourceLine: string
    ): number | null {
        const offset = documentLine.indexOf(tableSourceLine);
        if (offset < 0) {
            return null;
        }

        const prefix = documentLine.slice(0, offset);
        const suffix = documentLine.slice(offset + tableSourceLine.length);
        if (!/^[\s>]*$/.test(prefix) || suffix.trim().length > 0) {
            return null;
        }

        return offset;
    }

    /**
     * 按渲染顺序收集 Markdown 表格 Task List 标记位置
     * @param tableToken - Marked 解析得到的表格 token
     * @param documentLines - Markdown 文档源码行
     * @param tableSourceLines - 解析器提供的表格源码行
     * @param tableStartLine - 表格在文档中的起始行
     * @returns 与表格单元格渲染顺序对应的任务标记位置
     */
    private static collectMarkdownTableTaskLocations(
        tableToken: Tokens.Table,
        documentLines: string[],
        tableSourceLines: string[],
        tableStartLine: number | null
    ): Array<MarkdownTableTaskLocation | null> {
        const locations: Array<MarkdownTableTaskLocation | null> = tableToken.header.map(() => null);

        tableToken.rows.forEach((row, rowIndex) => {
            const sourceLineIndex = rowIndex + 2;
            const documentLineIndex = tableStartLine === null ? -1 : tableStartLine + sourceLineIndex;
            const tableSourceLine = tableSourceLines[sourceLineIndex] ?? '';
            const documentLine = documentLineIndex >= 0 ? documentLines[documentLineIndex] : '';
            const contentOffset = documentLine
                ? this.getMarkdownTableLineContentOffset(documentLine, tableSourceLine)
                : null;
            const taskCharacters = this.findMarkdownTableTaskCharacters(tableSourceLine);

            row.forEach((cell, cellIndex) => {
                const taskCharacter = taskCharacters[cellIndex];
                if (
                    documentLineIndex >= 0
                    && contentOffset !== null
                    && typeof taskCharacter === 'number'
                    && MARKDOWN_TABLE_TASK_PATTERN.test(cell.text)
                ) {
                    locations.push({
                        line: documentLineIndex,
                        character: contentOffset + taskCharacter,
                        sourceLine: sourceLineIndex,
                        sourceCharacter: taskCharacter,
                    });
                } else {
                    locations.push(null);
                }
            });
        });

        return locations;
    }

    /**
     * 提取 Markdown 表格源码行中各单元格的 Task List 标记字符位置
     * @param line - Markdown 表格源码行
     * @returns 与源码单元格顺序对应的任务标记字符位置
     */
    private static findMarkdownTableTaskCharacters(line: string): Array<number | null> {
        const cellRanges: Array<{ start: number; end: number }> = [];
        let cellStart = 0;

        for (let index = 0; index < line.length; index++) {
            if (line[index] !== '|') {
                continue;
            }

            let backslashCount = 0;
            for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor--) {
                backslashCount++;
            }
            if (backslashCount % 2 === 1) {
                continue;
            }

            cellRanges.push({ start: cellStart, end: index });
            cellStart = index + 1;
        }
        cellRanges.push({ start: cellStart, end: line.length });

        if (cellRanges.length > 0 && line.slice(cellRanges[0].start, cellRanges[0].end).trim() === '') {
            cellRanges.shift();
        }
        if (
            cellRanges.length > 0
            && line.slice(cellRanges[cellRanges.length - 1].start, cellRanges[cellRanges.length - 1].end).trim() === ''
        ) {
            cellRanges.pop();
        }

        return cellRanges.map(range => {
            const cellSource = line.slice(range.start, range.end);
            const match = MARKDOWN_TABLE_TASK_SOURCE_PREFIX_PATTERN.exec(cellSource);
            return match ? range.start + match[1].length : null;
        });
    }

    /**
     * 沿 Marked 的块引用和列表层级将真实任务项映射回原文标记
     * @param tokens - Marked 已识别的正文块
     * @param source - 去除 front matter 的正文
     * @param firstLine - 正文在文档中的起始行
     * @param lines - 含原始缩进和引用符的文档行
     * @returns 列表复选框的源码位置和各个表格块的起始行
     */
    private static collectTaskLocations(tokens: Token[], source: string, firstLine: number, lines: string[]) {
        const taskLocations: Array<{ line: number; character: number } | null> = [];
        const tableLines = new Map<Tokens.Table, number>();

        // Marked 会为容器子块去掉列表缩进和引用前缀，但保留换行
        const visit = (blocks: Token[], text: string, startLine: number) => {
            let cursor = 0;
            let line = startLine;
            for (const block of blocks) {
                const offset = text.indexOf(block.raw, cursor);
                if (offset < 0) {
                    line = -1;
                } else if (line >= 0) {
                    line += text.slice(cursor, offset).split('\n').length - 1;
                }
                if (block.type === 'table' && line >= 0) {
                    tableLines.set(block as Tokens.Table, line);
                } else if (block.type === 'blockquote') {
                    const quote = block as Tokens.Blockquote;
                    visit(quote.tokens, quote.text, line);
                } else if (block.type === 'list') {
                    let itemLine = line;
                    for (const item of block.items as Tokens.ListItem[]) {
                        if (item.task) {
                            const marker = item.raw.split('\n', 1)[0].match(/^\s*(?:[-+*]|\d+[.)])\s+(\[[ xX]\].*)$/);
                            const original = lines[itemLine] ?? '';
                            const character = marker ? original.trimEnd().length - marker[1].trimEnd().length : -1;
                            taskLocations.push(marker && character >= 0 && original.slice(character).trimEnd() === marker[1].trimEnd()
                                ? { line: itemLine, character } : null);
                        }
                        visit(item.tokens, item.text, itemLine);
                        if (itemLine >= 0) itemLine += item.raw.split('\n').length - 1;
                    }
                }
                if (offset >= 0) cursor = offset + block.raw.length;
                if (line >= 0) line += block.raw.split('\n').length - 1;
            }
        };
        visit(tokens, source.replace(/\r\n?/g, '\n').replace(/^( *)(\t+)/gm,
            (_, spaces: string, tabs: string) => spaces + '    '.repeat(tabs.length)), firstLine);
        return { taskLocations, tableLines };
    }

    /**
     * 将 Markdown 表格单元格开头的任务标记渲染为可交互复选框
     * @param content - 已完成行内语法渲染的单元格内容
     * @param location - Task List 标记在 Markdown 源码中的位置
     * @returns 返回包含可交互任务复选框的单元格内容
     */
    private static renderTableTaskCheckbox(
        content: string,
        location: MarkdownTableTaskLocation | null
    ): string {
        const taskMatch = content.match(MARKDOWN_TABLE_TASK_PATTERN);
        if (!taskMatch) {
            return content;
        }

        const checked = taskMatch[1].toLowerCase() === 'x';
        const locationAttributes = location
            ? ` data-line="${location.line}" data-char="${location.character}"`
                + ` data-source-line="${location.sourceLine}" data-source-char="${location.sourceCharacter}"`
            : ' disabled';
        const checkbox = '<input type="checkbox" class="table-task-checkbox"'
            + (checked ? ' checked=""' : '')
            + locationAttributes
            + '>';
        return checkbox + content.slice(taskMatch[0].length);
    }

    /**
     * 将 front matter 数据渲染为无表头表格
     * @param data - 待处理的数据对象
     * @returns 返回渲染后的内容
     */
    private static renderFrontMatterTable(data: Record<string, unknown>): string {
        let rows = '';
        for (const [key, value] of Object.entries(data)) {
            const valueHtml = this.renderFrontMatterValue(value);
            rows += `<tr><td class="fm-key">${escapeHtml(key)}</td><td class="fm-value">${valueHtml}</td></tr>`;
        }
        return `<div id="frontmatter" class="frontmatter-wrap"><table class="frontmatter"><tbody>${rows}</tbody></table></div>`;
    }

    /**
     * 按值类型将 front matter 内容渲染为标签、结构化 JSON 或普通文本
     * @param value - 待展示的 front matter 属性值
     * @returns 返回适合当前值类型的安全 HTML
     */
    private static renderFrontMatterValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return escapeHtml(value.toISOString().split('T')[0]);
        }
        if (Array.isArray(value)) {
            const isTagList = value.length > 0 && value.every(item => (
                item !== null && item !== undefined && (typeof item !== 'object' || item instanceof Date)
            ));
            if (isTagList) {
                const items = value.map(item => {
                    const text = item instanceof Date ? item.toISOString().split('T')[0] : String(item);
                    return `<li class="fm-tag">${escapeHtml(text)}</li>`;
                }).join('');
                return `<ul class="fm-tags">${items}</ul>`;
            }
            return this.renderFrontMatterJson(value);
        }
        if (typeof value === 'object') {
            return this.renderFrontMatterJson(value);
        }
        if (typeof value === 'string') {
            const jsonValue = this.parseFrontMatterJson(value);
            if (jsonValue !== null) {
                return this.renderFrontMatterJson(jsonValue);
            }
        }
        return escapeHtml(String(value));
    }

    /**
     * 解析 front matter 字符串中显式书写的 JSON 容器
     * @param value - 可能包含 JSON 对象或数组的字符串
     * @returns 返回解析后的 JSON 容器，非 JSON 容器返回 null
     */
    private static parseFrontMatterJson(value: string): Record<string, unknown> | unknown[] | null {
        const trimmed = value.trim();
        const isJsonContainer = (trimmed.startsWith('{') && trimmed.endsWith('}'))
            || (trimmed.startsWith('[') && trimmed.endsWith(']'));
        if (!isJsonContainer) {
            return null;
        }

        try {
            const parsed: unknown = JSON.parse(trimmed);
            return parsed !== null && typeof parsed === 'object'
                ? parsed as Record<string, unknown> | unknown[]
                : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * 将复合 front matter 值格式化为保留缩进的 JSON
     * @param value - 待格式化的对象或数组
     * @returns 返回经过 HTML 转义的结构化 JSON
     */
    private static renderFrontMatterJson(value: object): string {
        return `<div class="fm-json">${escapeHtml(JSON.stringify(value, null, 2))}</div>`;
    }

    /**
     * 根据当前引用块的首段标记渲染 GitHub 提示框并保留嵌套引用
     * @param quote - Marked 已渲染的单个引用块正文
     * @returns 带标题的提示框或普通引用块
     */
    private static renderBlockquote(quote: string): string {
        const alertTypes: Record<string, { icon: string; label: string }> = {
            'NOTE':      { icon: 'codicon-info',      label: 'Note' },
            'TIP':       { icon: 'codicon-lightbulb',  label: 'Tip' },
            'IMPORTANT': { icon: 'codicon-report',     label: 'Important' },
            'WARNING':   { icon: 'codicon-warning',    label: 'Warning' },
            'CAUTION':   { icon: 'codicon-error',      label: 'Caution' },
        };

        const match = quote.match(/^\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br>)?\s*([\s\S]*?)<\/p>/i);
        if (!match) {
            return `<blockquote>\n${quote}</blockquote>\n`;
        }
        const type = match[1].toUpperCase();
        const { icon, label } = alertTypes[type];
        const first = match[2].trim();
        return `<div class="markdown-alert markdown-alert-${type.toLowerCase()}">`
            + `<p class="markdown-alert-title"><i class="codicon ${icon}"></i> ${label}</p>`
            + (first ? `<p>${first}</p>` : '') + quote.slice(match[0].length) + '</div>\n';
    }

    /**
     * 根据编辑器可见范围的起始行，找到对应的章节
     * @param headings - 标题信息集合
     * @param visibleStartLine - 可见区域起始行号
     * @returns 返回当前可见区域对应的标题信息
     */
    static findCurrentHeading(headings: HeadingInfo[], visibleStartLine: number): HeadingInfo | null {
        if (headings.length === 0) {
            return null;
        }

        // 找到最后一个行号小于等于可见起始行的标题
        let currentHeading: HeadingInfo | null = null;
        for (const heading of headings) {
            if (heading.line <= visibleStartLine) {
                currentHeading = heading;
            } else {
                break;
            }
        }

        return currentHeading;
    }
}
