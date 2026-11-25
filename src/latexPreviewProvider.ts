import { HeadingInfo, PreviewResult } from './fileTypes';
import { escapeHtml, escapeRegex, generateHeadingId } from './utils';

/**
 * 提供 LatexPreview 相关预览能力
 */
export class LatexPreviewProvider {
    /**
     * 解析 LaTeX 内容，返回需要客户端 KaTeX 渲染的 HTML
     * 将 LaTeX 源码作为待渲染内容传给 webview
     * @param content - 待解析的文件内容
     * @returns 返回解析后的预览结果
     */
    static parse(content: string): PreviewResult {
        const headings: HeadingInfo[] = [];
        const html = this.convertLatexToHtml(content, headings);

        return {
            html,
            fileType: 'latex',
            supportsLocate: true,
            clientRender: 'katex',
            headings,
        };
    }

    /**
     * 将 LaTeX 内容转换为包含 KaTeX 标记的 HTML
     * @param content - 待解析的文件内容
     * @param headings - 标题信息集合
     * @returns 返回包含 KaTeX 占位标记的 HTML
     */
    private static convertLatexToHtml(content: string, headings: HeadingInfo[]): string {
        const lines = content.split('\n');
        const parts: Array<string | string[]> = [];
        let inMathEnv = false;
        let mathBuffer: string[] = [];
        let mathEnvName = '';
        let inDisplayMath = false;
        let displayMathBuffer: string[] = [];
        const usedHeadingIds = new Map<string, number>();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 汇总跨行数学环境直到匹配对应的结束标记
            if (inMathEnv) {
                mathBuffer.push(line);
                const endMatch = line.match(new RegExp(`\\\\end\\{${escapeRegex(mathEnvName)}\\}`));
                if (endMatch) {
                    inMathEnv = false;
                    const mathContent = mathBuffer.join('\n');
                    parts.push(`<div class="katex-block" data-katex-display="true">${escapeHtml(mathContent)}</div>`);
                    mathBuffer = [];
                }
                continue;
            }

            // 汇总跨行 $$ 数学块直到结束分隔符
            if (inDisplayMath) {
                displayMathBuffer.push(line);
                if (trimmed.endsWith('$$')) {
                    inDisplayMath = false;
                    parts.push(`<div class="katex-block" data-katex-display="true">${escapeHtml(displayMathBuffer.join('\n'))}</div>`);
                    displayMathBuffer = [];
                }
                continue;
            }

            // 检测数学环境开始并兼容同一行结束的写法
            const beginMatch = line.match(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath|math)\}/);
            if (beginMatch) {
                mathEnvName = beginMatch[1];
                mathBuffer = [line];
                const endMatch = line.match(new RegExp(`\\\\end\\{${escapeRegex(mathEnvName)}\\}`));
                if (endMatch && endMatch.index !== undefined && endMatch.index > (beginMatch.index ?? -1)) {
                    parts.push(`<div class="katex-block" data-katex-display="true">${escapeHtml(line)}</div>`);
                    mathBuffer = [];
                } else {
                    inMathEnv = true;
                }
                continue;
            }

            // 检测单行或跨行 $$ 显示公式
            if (trimmed.startsWith('$$')) {
                displayMathBuffer = [line];
                if (trimmed.length > 2 && trimmed.endsWith('$$')) {
                    parts.push(`<div class="katex-block" data-katex-display="true">${escapeHtml(line)}</div>`);
                    displayMathBuffer = [];
                } else {
                    inDisplayMath = true;
                }
                continue;
            }

            // 跳过空行
            if (!trimmed) {
                parts.push('<br>');
                continue;
            }

            // 文档结构命令
            if (trimmed.startsWith('\\documentclass') || trimmed.startsWith('\\usepackage') ||
                trimmed.startsWith('\\begin{document}') || trimmed.startsWith('\\end{document}')) {
                parts.push(`<div class="latex-command">${escapeHtml(trimmed)}</div>`);
                continue;
            }

            // 标题命令
            const sectionMatch = trimmed.match(/\\(section|subsection|subsubsection|chapter|part)\*?\s*\{/);
            if (sectionMatch && sectionMatch.index !== undefined) {
                const levelMap: Record<string, number> = {
                    'part': 1, 'chapter': 1, 'section': 2, 'subsection': 3, 'subsubsection': 4
                };
                const level = levelMap[sectionMatch[1]] || 2;
                const openingBraceIndex = sectionMatch.index + sectionMatch[0].lastIndexOf('{');
                const text = this.extractBalancedBraceContent(trimmed, openingBraceIndex);
                if (text !== null) {
                    const id = generateHeadingId(text, usedHeadingIds);
                    headings.push({ level, text, line: i, id });
                    parts.push(`<h${level} id="${id}">${escapeHtml(text)}</h${level}>`);
                    continue;
                }
            }

            // \\title 命令
            const titleMatch = trimmed.match(/\\title\s*\{/);
            if (titleMatch && titleMatch.index !== undefined) {
                const openingBraceIndex = titleMatch.index + titleMatch[0].lastIndexOf('{');
                const text = this.extractBalancedBraceContent(trimmed, openingBraceIndex);
                if (text !== null) {
                    const id = generateHeadingId(text, usedHeadingIds);
                    headings.push({ level: 1, text, line: i, id });
                    parts.push(`<h1 id="${id}">${escapeHtml(text)}</h1>`);
                    continue;
                }
            }

            // \\author 命令
            const authorMatch = trimmed.match(/\\author\s*\{/);
            if (authorMatch && authorMatch.index !== undefined) {
                const openingBraceIndex = authorMatch.index + authorMatch[0].lastIndexOf('{');
                const author = this.extractBalancedBraceContent(trimmed, openingBraceIndex);
                if (author !== null) {
                    parts.push(`<p class="latex-author">${escapeHtml(author)}</p>`);
                    continue;
                }
            }

            // \\maketitle
            if (trimmed === '\\maketitle') {
                continue;
            }

            // 注释
            if (trimmed.startsWith('%')) {
                parts.push(`<div class="latex-comment">${escapeHtml(trimmed)}</div>`);
                continue;
            }

            // 同一段普通文本的行内公式可以跨行，遇到空行或结构命令后另起一段
            const previous = parts[parts.length - 1];
            if (Array.isArray(previous)) {
                previous.push(trimmed);
            } else {
                parts.push([trimmed]);
            }
        }

        if (inMathEnv && mathBuffer.length > 0) {
            parts.push(`<pre class="error-detail">${escapeHtml(mathBuffer.join('\n'))}</pre>`);
        }
        if (inDisplayMath && displayMathBuffer.length > 0) {
            parts.push(`<pre class="error-detail">${escapeHtml(displayMathBuffer.join('\n'))}</pre>`);
        }

        return parts.map(part => typeof part === 'string' ? part : this.renderInlineParagraph(part)).join('\n');
    }

    /**
     * 在连续正文行中排版行内公式并保留公式之外的原有段落
     * @param lines - 同一正文段内的 LaTeX 源码行
     * @returns 包含行内公式占位符和普通文本的段落
     */
    private static renderInlineParagraph(lines: string[]): string {
        const source = lines.join('\n');
        const text = (value: string) => escapeHtml(value).replace(/\n/g, '</p>\n<p>');
        const delimiters = /(?:\\[\s\S])|\$/g;
        let html = '<p>';
        let start = 0;
        let open = -1;
        for (const match of source.matchAll(delimiters)) {
            if (match[0] !== '$') continue;
            const index = match.index!;
            if (open < 0) {
                open = index;
            } else {
                html += text(source.slice(start, open))
                    + `<span class="katex-inline" data-katex-display="false">${escapeHtml(source.slice(open + 1, index))}</span>`;
                start = index + 1;
                open = -1;
            }
        }
        return html + text(source.slice(start)) + '</p>';
    }

    /**
     * 提取 LaTeX 命令中支持嵌套花括号的参数内容
     * @param source - 包含 LaTeX 命令的单行源码
     * @param openingBraceIndex - 命令参数起始花括号的位置
     * @returns 返回完整参数内容，花括号未闭合时返回 null
     */
    private static extractBalancedBraceContent(source: string, openingBraceIndex: number): string | null {
        let depth = 0;
        for (let index = openingBraceIndex; index < source.length; index++) {
            const character = source[index];
            if (character === '\\' && (source[index + 1] === '{' || source[index + 1] === '}')) {
                index++;
                continue;
            }
            if (character === '{') {
                depth++;
                continue;
            }
            if (character === '}') {
                depth--;
                if (depth === 0) {
                    return source.slice(openingBraceIndex + 1, index);
                }
            }
        }
        return null;
    }
}
