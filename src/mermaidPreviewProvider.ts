import { PreviewResult } from './fileTypes';
import { escapeHtml } from './utils';

export class MermaidPreviewProvider {
    /**
     * 解析 Mermaid 内容，返回需要客户端 mermaid.js 渲染的 HTML
     */
    static parse(content: string): PreviewResult {
        // 基本语法验证：检查是否以已知的 mermaid 图表类型开头
        const trimmed = content.trim();
        const validStarts = [
            'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
            'stateDiagram', 'erDiagram', 'journey', 'gantt',
            'pie', 'quadrantChart', 'requirementDiagram', 'gitgraph',
            'mindmap', 'timeline', 'zenuml', 'sankey', 'xychart',
            'block', 'packet', 'kanban', 'architecture',
            '%%', '---'
        ];

        const firstLine = trimmed.split('\n')[0].trim();
        const isValid = validStarts.some(start => firstLine.startsWith(start));
        if (!isValid && firstLine.length > 0) {
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
}
