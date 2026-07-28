import { Marked, Renderer, type Tokens } from 'marked';
import hljs from 'highlight.js';
import * as yaml from 'js-yaml';
import { HeadingInfo } from './fileTypes';
import { escapeHtml } from './utils';

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

        // 先提取标题信息
        const usedIds = new Map<string, number>();
        const lines = content.split(/\r?\n/);
        let headingFenceMarker: string | null = null;
        lines.forEach((line, index) => {
            const fenceMatch = line.match(/^\s*([`~]{3,})/);
            if (fenceMatch) {
                const marker = fenceMatch[1];
                if (!headingFenceMarker) {
                    headingFenceMarker = marker;
                    return;
                }

                if (marker[0] === headingFenceMarker[0] && marker.length >= headingFenceMarker.length) {
                    headingFenceMarker = null;
                    return;
                }
            }

            if (headingFenceMarker) {
                return;
            }

            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const id = this.generateHeadingId(text, usedIds);
                headings.push({ level, text, line: index, id });
            }
        });

        // 扫描 task list 行号（忽略 fenced code block 内的伪 task）
        const taskLines = this.collectTaskListLineNumbers(lines);

        // 配置 marked
        const renderer = new Renderer();
        let taskIndex = 0;
        const markdownTableData: string[] = [];
        let markdownTableIndex = 0;
        const markdownTableTaskLocations: Array<MarkdownTableTaskLocation | null> = [];
        let markdownTableCellIndex = 0;
        let markdownTableSearchLine = content.slice(0, content.length - bodyContent.length).split('\n').length - 1;

        renderer.checkbox = function (checked: boolean): string {
            const line = taskLines[taskIndex] ?? -1;
            taskIndex++;
            return '<input type="checkbox"'
                + (checked ? ' checked=""' : '')
                + ' data-line="' + line + '">';
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
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
            const langClass = lang ? ` language-${lang}` : '';
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
        parser.walkTokens(markdownTokens, token => {
            if (token.type === 'table') {
                const tableToken = token as Tokens.Table;
                const tableSourceLines = tableToken.raw.split(/\r?\n/);
                while (tableSourceLines.length > 0 && tableSourceLines[tableSourceLines.length - 1].trim() === '') {
                    tableSourceLines.pop();
                }
                const tableStartLine = this.findMarkdownTableStartLine(
                    lines,
                    tableSourceLines,
                    markdownTableSearchLine
                );
                markdownTableTaskLocations.push(...this.collectMarkdownTableTaskLocations(
                    tableToken,
                    lines,
                    tableSourceLines,
                    tableStartLine
                ));
                if (tableStartLine !== null) {
                    markdownTableSearchLine = tableStartLine + tableSourceLines.length;
                }
                markdownTableData.push(JSON.stringify({
                    source: tableToken.raw,
                    alignments: tableToken.align,
                }));
            }
        });
        let html = parser.parser(markdownTokens);

        // 转换 GitHub 风格的 alert blockquote
        html = this.transformGitHubAlerts(html);

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
     * 在 Markdown 文档中定位表格源码的起始行
     * @param documentLines - Markdown 文档源码行
     * @param tableSourceLines - 解析器提供的表格源码行
     * @param searchStartLine - 当前表格的最早搜索行
     * @returns 表格在文档中的起始行，无法定位时返回 null
     */
    private static findMarkdownTableStartLine(
        documentLines: string[],
        tableSourceLines: string[],
        searchStartLine: number
    ): number | null {
        if (tableSourceLines.length < 2) {
            return null;
        }

        const lastStartLine = documentLines.length - tableSourceLines.length;
        for (let line = Math.max(0, searchStartLine); line <= lastStartLine; line++) {
            const matches = tableSourceLines.every((tableLine, index) => (
                this.getMarkdownTableLineContentOffset(documentLines[line + index], tableLine) !== null
            ));
            if (matches) {
                return line;
            }
        }

        return null;
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
                    && taskCharacter !== null
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
     * 收集任务列表复选框在原文中的行号
     * @param lines - 按行拆分后的源文本
     * @returns 返回任务复选框对应的行号列表
     */
    private static collectTaskListLineNumbers(lines: string[]): number[] {
        const taskLines: number[] = [];
        const taskPattern = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/;

        let fenceMarker: string | null = null;

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const fenceMatch = line.match(/^\s*([`~]{3,})/);

            if (fenceMatch) {
                const marker = fenceMatch[1];
                if (!fenceMarker) {
                    fenceMarker = marker;
                    continue;
                }

                if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
                    fenceMarker = null;
                    continue;
                }
            }

            if (!fenceMarker && taskPattern.test(line)) {
                taskLines.push(index);
            }
        }

        return taskLines;
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
            : '';
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
     * 渲染 front matter 的值（支持嵌套对象/数组 → ul > li）
     * @param value - 待处理的值
     * @returns 返回渲染后的内容
     */
    private static renderFrontMatterValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return escapeHtml(value.toISOString().split('T')[0]);
        }
        if (Array.isArray(value)) {
            const items = value.map(v => `<li>${this.renderFrontMatterValue(v)}</li>`).join('');
            return `<ul>${items}</ul>`;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>);
            if (entries.length === 0) {
                return escapeHtml(String(value));
            }
            const items = entries
                .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${this.renderFrontMatterValue(v)}</li>`)
                .join('');
            return `<ul>${items}</ul>`;
        }
        return escapeHtml(String(value));
    }

    /**
     * 转换 GitHub 风格的 alert blockquote
     * > [!NOTE]
     * > Content
     * @param html - 待转换的 HTML 内容
     * @returns 返回转换后的提示块 HTML
     */
    private static transformGitHubAlerts(html: string): string {
        const alertTypes: Record<string, { icon: string; label: string }> = {
            'NOTE':      { icon: 'codicon-info',      label: 'Note' },
            'TIP':       { icon: 'codicon-lightbulb',  label: 'Tip' },
            'IMPORTANT': { icon: 'codicon-report',     label: 'Important' },
            'WARNING':   { icon: 'codicon-warning',    label: 'Warning' },
            'CAUTION':   { icon: 'codicon-error',      label: 'Caution' },
        };

        for (const [type, { icon, label }] of Object.entries(alertTypes)) {
            const typeLower = type.toLowerCase();
            // 匹配首个段落以 [!TYPE] 开头的 blockquote
            const regex = new RegExp(
                `<blockquote>\\s*<p>\\[!${type}\\]\\s*(?:<br>)?\\s*([\\s\\S]*?)</p>([\\s\\S]*?)</blockquote>`,
                'gi'
            );
            html = html.replace(regex, (_match, firstContent, rest) => {
                const content = firstContent.trim() ? `<p>${firstContent.trim()}</p>` : '';
                return `<div class="markdown-alert markdown-alert-${typeLower}">`
                    + `<p class="markdown-alert-title"><i class="codicon ${icon}"></i> ${label}</p>`
                    + content
                    + rest
                    + `</div>`;
            });
        }

        return html;
    }

    /**
     * 生成标题锚点 ID（同名标题自动追加唯一 hex 后缀）
     * @param text - 待处理的文本内容
     * @param usedIds - 已占用标题 ID 计数映射
     * @returns 返回唯一的标题锚点 ID
     */
    private static generateHeadingId(text: string, usedIds: Map<string, number>): string {
        let slug = '';
        if (text) {
            slug = text
                .toLowerCase()
                .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                .replace(/^-|-$/g, '');
        }
        if (!slug) {
            slug = 'heading';
        }
        const count = usedIds.get(slug) ?? 0;
        usedIds.set(slug, count + 1);
        if (count === 0) {
            return slug;
        }
        // 用递增计数器转 hex 作后缀，保证不重复
        return `${slug}-${count.toString(16)}`;
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
