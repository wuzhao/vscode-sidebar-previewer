import { Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import * as yaml from 'js-yaml';
import { HeadingInfo } from './fileTypes';

export class MarkdownProvider {
    /**
     * 解析 Markdown 内容，返回 HTML 和标题信息
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
            } catch (_e) {
                // YAML 解析失败，忽略 front matter
            }
            bodyContent = content.slice(fmMatch[0].length);
        }

        // 先提取标题信息
        const usedIds = new Map<string, number>();
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const id = this.generateHeadingId(text, usedIds);
                headings.push({ level, text, line: index, id });
            }
        });

        // 扫描 task list 行号
        const taskLines: number[] = [];
        lines.forEach((line, index) => {
            if (/^\s*[-*+]\s+\[([ xX])\]/.test(line)) {
                taskLines.push(index);
            }
        });

        // 配置 marked
        const renderer = new Renderer();
        let taskIndex = 0;

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

        let headingIndex = 0;
        renderer.heading = function (text: string, level: number, _raw: string): string {
            const heading = headings[headingIndex++];
            const id = heading?.id || `heading-${headingIndex}`;
            return `<h${level} id="${id}">${text}</h${level}>\n`;
        };

        renderer.code = function (code: string, infostring: string | undefined): string {
            const lang = (infostring || '').match(/^\S*/)?.[0] || '';
            if (lang === 'mermaid') {
                return `<div class="mermaid mermaid-block">${MarkdownProvider.escapeHtml(code)}</div>\n`;
            }
            if (lang === 'math') {
                return `<div class="katex-block" data-katex-display="true">${MarkdownProvider.escapeHtml(code)}</div>\n`;
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

        // Math Extension for $$...$$
        const mathExtension: any = {
            name: 'mathInline',
            level: 'inline',
            start(src: string) { return src.match(/\$\$/)?.index; },
            tokenizer(src: string, tokens: any) {
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
            renderer(token: any) {
                return `<span class="katex-inline" data-katex-display="false">${MarkdownProvider.escapeHtml(token.text)}</span>`;
            }
        };

        // Math Extension for \begin{...}...\end{...}
        const mathBlockExtension: any = {
            name: 'mathBlock',
            level: 'block',
            start(src: string) { return src.match(/\\begin\{([a-zA-Z*]+)\}/)?.index; },
            tokenizer(src: string, tokens: any) {
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
            renderer(token: any) {
                return `<div class="katex-block" data-katex-display="true">${MarkdownProvider.escapeHtml(token.text)}</div>\n`;
            }
        };

        const parser = new Marked();
        parser.setOptions({
            gfm: true,
            breaks: true,
            renderer,
        });
        parser.use({ extensions: [mathExtension, mathBlockExtension] });

        // 解析 Markdown（不含 front matter）
        let html = parser.parse(bodyContent) as string;

        // 转换 GitHub 风格的 alert blockquote
        html = this.transformGitHubAlerts(html);

        // 在正文前插入 front matter 表格
        if (frontMatterHtml) {
            html = frontMatterHtml + html;
        }

        return { html, headings };
    }

    /**
     * 将 front matter 数据渲染为无表头表格
     */
    private static renderFrontMatterTable(data: Record<string, unknown>): string {
        let rows = '';
        for (const [key, value] of Object.entries(data)) {
            const valueHtml = this.renderFrontMatterValue(value);
            rows += `<tr><td class="fm-key">${this.escapeHtml(key)}</td><td class="fm-value">${valueHtml}</td></tr>`;
        }
        return `<table class="frontmatter-table"><tbody>${rows}</tbody></table>`;
    }

    /**
     * 渲染 front matter 的值（支持嵌套对象/数组 → ul > li）
     */
    private static renderFrontMatterValue(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (value instanceof Date) {
            return this.escapeHtml(value.toISOString().split('T')[0]);
        }
        if (Array.isArray(value)) {
            const items = value.map(v => `<li>${this.renderFrontMatterValue(v)}</li>`).join('');
            return `<ul>${items}</ul>`;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>);
            if (entries.length === 0) {
                return this.escapeHtml(String(value));
            }
            const items = entries
                .map(([k, v]) => `<li><strong>${this.escapeHtml(k)}:</strong> ${this.renderFrontMatterValue(v)}</li>`)
                .join('');
            return `<ul>${items}</ul>`;
        }
        return this.escapeHtml(String(value));
    }

    /**
     * HTML 转义
     */
    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 转换 GitHub 风格的 alert blockquote
     * > [!NOTE]
     * > Content
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
            // Match blockquote whose first <p> starts with [!TYPE]
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