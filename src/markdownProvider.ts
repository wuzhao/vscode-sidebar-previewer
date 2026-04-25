import { Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import * as yaml from 'js-yaml';
import { HeadingInfo } from './fileTypes';
import { escapeHtml } from './utils';

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
            } catch (error) {
                console.warn('Sidebar Previewer: failed to parse front matter YAML', error);
            }
            bodyContent = content.slice(fmMatch[0].length);
        }

        // 先提取标题信息
        const usedIds = new Map<string, number>();
        const lines = content.split('\n');
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
            /** 定位行内数学公式的起始位置。 */
            start(src: string) { return src.match(/\$\$/)?.index; },
            /** 将 $$...$$ 片段解析为行内数学标记。 */
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
            /** 输出行内 KaTeX 占位标记，交由前端统一渲染。 */
            renderer(token: any) {
                return `<span class="katex-inline" data-katex-display="false">${escapeHtml(token.text)}</span>`;
            }
        };

        // 扩展：支持 \begin{...}...\end{...} 块级数学语法
        const mathBlockExtension: any = {
            name: 'mathBlock',
            level: 'block',
            /** 定位块级数学公式的起始位置。 */
            start(src: string) { return src.match(/\\begin\{([a-zA-Z*]+)\}/)?.index; },
            /** 将 begin/end 包裹的片段解析为块级数学标记。 */
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
            /** 输出块级 KaTeX 占位标记，交由前端统一渲染。 */
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

        // 解析 Markdown（不含 front matter）
        let html = parser.parse(bodyContent) as string;

        // 转换 GitHub 风格的 alert blockquote
        html = this.transformGitHubAlerts(html);

        // 在正文前插入 front matter 表格
        if (frontMatterHtml) {
            html = frontMatterHtml + html;
        }

        const locateHeadings = frontMatterHtml
            ? [{ level: 1, text: 'frontmatter-table', line: 0, id: 'frontmatter-table' }, ...headings]
            : headings;

        return { html, headings: locateHeadings };
    }

    /** 收集任务列表复选框在原文中的行号。 */
    private static collectTaskListLineNumbers(lines: string[]): number[] {
        const taskLines: number[] = [];
        const taskPattern = /^\s*[-*+]\s+\[([ xX])\]/;

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
     * 将 front matter 数据渲染为无表头表格
     */
    private static renderFrontMatterTable(data: Record<string, unknown>): string {
        let rows = '';
        for (const [key, value] of Object.entries(data)) {
            const valueHtml = this.renderFrontMatterValue(value);
            rows += `<tr><td class="fm-key">${escapeHtml(key)}</td><td class="fm-value">${valueHtml}</td></tr>`;
        }
        return `<table id="frontmatter-table" class="frontmatter-table"><tbody>${rows}</tbody></table>`;
    }

    /**
     * 渲染 front matter 的值（支持嵌套对象/数组 → ul > li）
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