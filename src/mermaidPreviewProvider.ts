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
