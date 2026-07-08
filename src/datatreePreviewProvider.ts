import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { FileType, PreviewResult } from './fileTypes';
import { escapeHtml } from './utils';
import { DatatreeXmlFileTypeBase } from './datatree/fileTypes/datatreeXmlFileTypeBase';

/**
 * 提供 DataTree 相关预览能力
 */
export class DatatreePreviewProvider extends DatatreeXmlFileTypeBase {
    /**
     * 解析数据文件内容，返回树形结构的 HTML
     * @param content - 待解析的文件内容
     * @param fileType - 当前文件类型标识
     * @returns 返回解析后的预览结果
     */
    static parse(content: string, fileType: FileType): PreviewResult {
        try {
            const parsed = this.parseContent(content, fileType);
            const lines = content.split('\n');
            const commentMetadata = this.buildCommentMetadata(lines, fileType);
            const lineLocator = this.createKeyLineLocator(lines, fileType);
            const arrayItemLineLocator = this.createArrayItemLineLocator(lines, fileType, parsed);
            const jsonCloseLineLocator = (fileType === 'json' || fileType === 'jsonl') ? this.createJsonCloseLineLocator(lines) : null;
            const yamlCloseLineLocator = fileType === 'yaml' ? this.createYamlCloseLineLocator(lines) : null;
            const xmlCloseLineLocator = fileType === 'xml' ? this.createXmlCloseLineLocator(lines) : null;
            const html = this.renderTree(
                parsed,
                lineLocator,
                arrayItemLineLocator,
                commentMetadata.lineComments,
                commentMetadata.standaloneGroups,
                fileType,
                lines,
                jsonCloseLineLocator,
                yamlCloseLineLocator,
                xmlCloseLineLocator
            );
            const wrappedHtml = `<div class="data-tree">${html}</div>`;

            if (wrappedHtml.length > this.MAX_HTML_LENGTH) {
                return {
                    html: '<div class="error-state"><div class="error-text">Preview content is too large to render safely.</div></div>',
                    fileType,
                    supportsLocate: false,
                };
            }

            return {
                html: wrappedHtml,
                fileType,
                supportsLocate: false,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                html: `<div class="error-state"><div class="error-text">Failed to parse ${fileType.toUpperCase()} content.</div><pre class="error-detail">${escapeHtml(message)}</pre></div>`,
                fileType,
                supportsLocate: false,
            };
        }
    }

    /**
     * 解析文件内容
     * @param content - 待解析的文件内容
     * @param fileType - 当前文件类型标识
     * @returns 返回解析后的结构化数据
     * @throws 当文件类型不受支持时抛出异常
     */
    private static parseContent(content: string, fileType: FileType): unknown {
        switch (fileType) {
            case 'json':
                return this.parseJsonOrJsonc(content);
            case 'jsonl':
                return this.parseJsonl(content);
            case 'yaml': {
                const docs = yaml.loadAll(content);
                return docs.length === 1 ? docs[0] : docs;
            }
            case 'toml':
                return toml.parse(content);
            case 'xml':
                return this.parseXml(content);
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }
}
