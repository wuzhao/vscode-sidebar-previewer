import { PreviewResult } from './fileTypes';
import { escapeHtml } from './utils';

/**
 * 提供 MermaidPreview 相关预览能力
 */
export class MermaidPreviewProvider {
    /**
     * 解析 Mermaid 内容，返回需要客户端 mermaid.js 渲染的 HTML
     * @param content - 待解析的文件内容
     * @returns 返回解析后的预览结果
     */
    static parse(content: string): PreviewResult {
        // 基本语法验证：检查是否以已知的 mermaid 图表类型开头
        const validStarts = [
            'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
            'stateDiagram', 'erDiagram', 'journey', 'gantt',
            'pie', 'quadrantChart', 'requirementDiagram', 'gitgraph',
            'mindmap', 'timeline', 'zenuml', 'sankey', 'xychart',
            'block', 'packet', 'kanban', 'architecture',
            '%%', '---'
        ];

        const firstDirectiveLine = this.findFirstDirectiveLine(content);
        const isValid = validStarts.some(start => firstDirectiveLine.startsWith(start));
        if (!isValid && firstDirectiveLine.length > 0) {
            throw new Error('Invalid Mermaid syntax: unrecognized diagram type');
        }

        // 将 mermaid 源码包装在特殊容器中，由客户端渲染
        const escapedContent = escapeHtml(content);

        const html = `<div class="mermaid-container"><pre class="mermaid">${escapedContent}</pre></div>`;

        return {
            html,
            fileType: 'mermaid',
            supportsLocate: false,
            clientRender: 'mermaid',
        };
    }

    /**
     * 查找首个指令行并返回匹配结果
     * @param content - 待解析的文件内容
     * @returns 返回匹配结果
     */
    private static findFirstDirectiveLine(content: string): string {
        const lines = content
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) {
            return '';
        }

        // 允许文件开头有 Mermaid 注释（%%），优先定位后续真实图声明
        for (const line of lines) {
            if (!line.startsWith('%%')) {
                return line;
            }
        }

        return lines[0];
    }
}
