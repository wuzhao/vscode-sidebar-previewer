import { HeadingInfo, PreviewResult } from './fileTypes';
import { escapeHtml, escapeRegex } from './utils';

export class LatexPreviewProvider {
    /**
     * 解析 LaTeX 内容，返回需要客户端 KaTeX 渲染的 HTML
     * 将 LaTeX 源码作为待渲染内容传给 webview
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
     */
    private static convertLatexToHtml(content: string, headings: HeadingInfo[]): string {
        const lines = content.split('\n');
        const parts: string[] = [];
        let inMathEnv = false;
        let mathBuffer: string[] = [];
        let mathEnvName = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 检测数学环境开始
            const beginMatch = line.match(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath|math)\}/);
            if (beginMatch) {
                inMathEnv = true;
                mathEnvName = beginMatch[1];
                mathBuffer = [line];
                continue;
            }

            // 检测数学环境结束
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

            // 检测 $$ 行内显示公式
            if (line.trim().startsWith('$$')) {
                parts.push(`<div class="katex-block" data-katex-display="true">${escapeHtml(line)}</div>`);
                continue;
            }

            // LaTeX 命令处理
            const trimmed = line.trim();

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
            const sectionMatch = trimmed.match(/\\(section|subsection|subsubsection|chapter|part)\*?\{(.+?)\}/);
            if (sectionMatch) {
                const levelMap: Record<string, number> = {
                    'part': 1, 'chapter': 1, 'section': 2, 'subsection': 3, 'subsubsection': 4
                };
                const level = levelMap[sectionMatch[1]] || 2;
                const text = sectionMatch[2];
                const id = this.slugify(text);
                headings.push({ level, text, line: i, id });
                parts.push(`<h${level} id="${id}">${escapeHtml(text)}</h${level}>`);
                continue;
            }

            // \\title 命令
            const titleMatch = trimmed.match(/\\title\{(.+?)\}/);
            if (titleMatch) {
                const text = titleMatch[1];
                const id = this.slugify(text);
                headings.push({ level: 1, text, line: i, id });
                parts.push(`<h1 id="${id}">${escapeHtml(text)}</h1>`);
                continue;
            }

            // \\author 命令
            const authorMatch = trimmed.match(/\\author\{(.+?)\}/);
            if (authorMatch) {
                parts.push(`<p class="latex-author">${escapeHtml(authorMatch[1])}</p>`);
                continue;
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

            // 包含行内数学公式的普通文本
            let processedLine = escapeHtml(trimmed);
            // 替换行内 $...$ 公式为 KaTeX 标记
            processedLine = processedLine.replace(/\$([^$]+?)\$/g, '<span class="katex-inline" data-katex-display="false">$1</span>');

            parts.push(`<p>${processedLine}</p>`);
        }

        if (inMathEnv && mathBuffer.length > 0) {
            parts.push(`<pre class="error-detail">${escapeHtml(mathBuffer.join('\n'))}</pre>`);
        }

        return parts.join('\n');
    }

    private static slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-|-$/g, '') || 'heading';
    }
}
