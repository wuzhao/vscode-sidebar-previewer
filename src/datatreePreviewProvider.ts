import * as yaml from 'js-yaml';
import * as toml from 'toml';
import { FileType, PreviewResult } from './fileTypes';
import { i18n } from './i18n';
import { MAX_PREVIEW_INPUT_BYTES, MAX_RENDERED_HTML_LENGTH, MAX_RENDERED_TREE_NODES } from './previewConfig';
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
            if (Buffer.byteLength(content, 'utf8') > MAX_PREVIEW_INPUT_BYTES) {
                return {
                    statusOnly: true,
                    html: `<div class="error-state"><div class="error-text">${escapeHtml(i18n.format(i18n.previewInputTooLarge, String(MAX_PREVIEW_INPUT_BYTES / 1024 / 1024)))}</div></div>`,
                    fileType,
                    supportsLocate: false,
                };
            }
            const parsed = this.parseContent(content, fileType);
            const lines = content.split('\n');
            const commentMetadata = this.buildCommentMetadata(lines, fileType);
            const { lineLocator, arrayItemLineLocator } = fileType === 'xml' ? this.createXmlLocators(lines, parsed) : {
                lineLocator: fileType === 'json' || fileType === 'jsonl'
                    ? this.createJsonKeyLocator(content, fileType === 'jsonl')
                    : this.createKeyLineLocator(lines, fileType),
                arrayItemLineLocator: this.createArrayItemLineLocator(this.buildArrayItemLineIndex(lines, fileType, parsed)),
            };
            const jsonCloseLineLocator = fileType === 'json' || fileType === 'jsonl' ? this.createJsonCloseLineLocator(lines) : null;
            const yamlCloseLineLocator = fileType === 'yaml' ? this.createYamlCloseLineLocator(lines) : null;
            const xmlCloseLineLocator = fileType === 'xml' ? this.createXmlCloseLineLocator(lines) : null;
            const renderResult = this.renderTree(
                parsed,
                lineLocator,
                arrayItemLineLocator,
                commentMetadata.lineComments,
                commentMetadata.standaloneGroups,
                fileType,
                lines,
                jsonCloseLineLocator,
                yamlCloseLineLocator,
                xmlCloseLineLocator,
                MAX_RENDERED_TREE_NODES,
            );
            let wrappedHtml = `<div class="data-tree">${renderResult.html}</div>`;
            if (renderResult.truncated) {
                wrappedHtml += `<div class="preview-truncated">${escapeHtml(i18n.format(i18n.treeNodesTruncated, String(renderResult.renderedNodes)))}</div>`;
            }

            if (wrappedHtml.length > MAX_RENDERED_HTML_LENGTH) {
                return {
                    statusOnly: true,
                    html: `<div class="error-state"><div class="error-text">${escapeHtml(i18n.previewContentTooLarge)}</div></div>`,
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
                statusOnly: true,
                html: `<div class="error-state"><div class="error-text">${escapeHtml(i18n.format(i18n.parseContentFailed, fileType.toUpperCase()))}</div><pre class="error-detail">${escapeHtml(message)}</pre></div>`,
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
                throw new Error(i18n.format(i18n.unsupportedFileType, fileType));
        }
    }
}
