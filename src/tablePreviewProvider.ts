import { PreviewResult } from './fileTypes';
import { i18n } from './i18n';
import {
    MAX_PREVIEW_INPUT_BYTES,
    MAX_RENDERED_HTML_LENGTH,
    MAX_RENDERED_TABLE_ROWS,
} from './previewConfig';
import { escapeHtml } from './utils';

type TabularFileType = 'csv' | 'tsv';

interface CellData {
    value: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

/**
 * CSV 或 TSV 分段解析结果
 */
interface ParsedTableRows {
    rows: CellData[][];
    truncated: boolean;
}

/**
 * 提供 TablePreview 相关预览能力
 */
export class TablePreviewProvider {
    /**
     * 解析输入内容并返回结构化结果
     * @param content - 待解析的文件内容
     * @param fileType - 当前文件类型标识
     * @returns 返回解析后的预览结果
     */
    static parse(content: string, fileType: TabularFileType): PreviewResult {
        try {
            if (Buffer.byteLength(content, 'utf8') > MAX_PREVIEW_INPUT_BYTES) {
                return {
                    statusOnly: true,
                    html: `<div class="error-state"><div class="error-text">${escapeHtml(i18n.format(i18n.previewInputTooLarge, String(MAX_PREVIEW_INPUT_BYTES / 1024 / 1024)))}</div></div>`,
                    fileType,
                    supportsLocate: false,
                };
            }
            const delimiter = fileType === 'csv' ? ',' : '\t';
            const parsedRows = this.parseRows(content, delimiter);
            const rows = parsedRows.rows;

            if (rows.length === 0) {
                return {
                    statusOnly: true,
                    html: `<div class="empty-state"><div class="empty-text">${escapeHtml(i18n.noTabularRows)}</div></div>`,
                    fileType,
                    supportsLocate: false,
                };
            }

            const html = this.renderTable(rows, parsedRows.truncated);

            return {
                html: html ?? `<div class="error-state"><div class="error-text">${escapeHtml(i18n.previewContentTooLarge)}</div></div>`,
                fileType,
                supportsLocate: html !== null,
                statusOnly: html === null,
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
     * 解析行数据并返回结构化结果
     * @param content - 待解析的文件内容
     * @param delimiter - CSV/TSV 字段分隔符
     * @returns 返回首段表格数据与是否截断的状态
     * @throws 当 CSV/TSV 引号字段未闭合时抛出异常
     */
    private static parseRows(content: string, delimiter: string): ParsedTableRows {
        if (content.length === 0 || (content.length === 1 && content.charCodeAt(0) === 0xFEFF)) {
            return { rows: [], truncated: false };
        }

        const rows: CellData[][] = [];
        let row: CellData[] = [];
        let cell = '';
        let inQuotes = false;
        let truncated = false;

        let currentLine = 0;
        let currentChar = 0;
        let i = 0;

        if (content.charCodeAt(0) === 0xFEFF) {
            i = 1;
            currentChar = 1;
        }

        let cellStartLine = currentLine;
        let cellStartChar = currentChar;

        const advance = (ch: string) => {
            if (ch === '\n') {
                currentLine++;
                currentChar = 0;
            } else {
                currentChar++;
            }
        };

        while (i < content.length) {
            const ch = content[i];

            if (inQuotes) {
                if (ch === '"') {
                    const next = i + 1 < content.length ? content[i + 1] : '';
                    if (next === '"') {
                        cell += '"';
                        advance('"');
                        advance('"');
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                    advance('"');
                    i += 1;
                    continue;
                }

                cell += ch;
                advance(ch);
                i += 1;
                continue;
            }

            if (ch === '"') {
                inQuotes = true;
                advance('"');
                i += 1;
                continue;
            }

            if (ch === delimiter) {
                row.push({
                    value: cell,
                    startLine: cellStartLine,
                    startChar: cellStartChar,
                    endLine: currentLine,
                    endChar: currentChar
                });
                cell = '';
                advance(ch);
                i += 1;
                cellStartLine = currentLine;
                cellStartChar = currentChar;
                continue;
            }

            if (ch === '\n') {
                row.push({
                    value: cell,
                    startLine: cellStartLine,
                    startChar: cellStartChar,
                    endLine: currentLine,
                    endChar: currentChar
                });
                rows.push(row);
                row = [];
                cell = '';
                advance(ch);
                i += 1;
                cellStartLine = currentLine;
                cellStartChar = currentChar;
                if (rows.length >= MAX_RENDERED_TABLE_ROWS + 1 && i < content.length) {
                    truncated = true;
                    break;
                }
                continue;
            }

            if (ch === '\r') {
                const nextIsNewline = i + 1 < content.length && content[i + 1] === '\n';
                row.push({
                    value: cell,
                    startLine: cellStartLine,
                    startChar: cellStartChar,
                    endLine: currentLine,
                    endChar: currentChar
                });
                rows.push(row);
                row = [];
                cell = '';
                i += 1;
                if (nextIsNewline) {
                    advance('\r');
                    advance('\n');
                    i += 1;
                } else {
                    currentLine++;
                    currentChar = 0;
                }
                cellStartLine = currentLine;
                cellStartChar = currentChar;
                if (rows.length >= MAX_RENDERED_TABLE_ROWS + 1 && i < content.length) {
                    truncated = true;
                    break;
                }
                continue;
            }

            cell += ch;
            advance(ch);
            i += 1;
        }

        if (inQuotes) {
            throw new Error(i18n.unterminatedQuotedField);
        }

        if (!truncated) {
            row.push({
                value: cell,
                startLine: cellStartLine,
                startChar: cellStartChar,
                endLine: currentLine,
                endChar: currentChar
            });

            if (row.length > 1 || row[0].value.length > 0 || !this.endsWithNewline(content)) {
                rows.push(row);
            }
        }

        return { rows, truncated };
    }

    /**
     * 判断源文本是否以换行结尾
     * @param source - 源文本或源数组对象
     * @returns 返回布尔判断结果
     */
    private static endsWithNewline(source: string): boolean {
        return source.endsWith('\n') || source.endsWith('\r');
    }

    /**
     * 渲染表格并返回可展示内容
     * @param rows - 首段表格行数据集合
     * @param sourceTruncated - 源文件是否因行数限制被截断
     * @returns 首段完整表格 HTML，表头或首行超过预算时返回 null
     */
    private static renderTable(rows: CellData[][], sourceTruncated: boolean): string | null {
        const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const footer = '</tbody></table></div></div>';
        const notice = (count: number) =>
            `<div class="preview-truncated">${escapeHtml(i18n.format(i18n.tableRowsTruncated, String(count)))}</div>`;
        const budget = MAX_RENDERED_HTML_LENGTH - footer.length - notice(rows.length).length;
        let html = '<div class="table-preview"><div class="table-preview-scroll"><table class="tabular-table"><thead>';
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const last = row[row.length - 1];
            const header = rowIndex === 0;
            const tag = header ? 'th' : 'td';
            let rowHtml = `<tr><${tag} class="table-index-column">${header ? '#' : rowIndex}</${tag}>`;
            const rowEnd = header ? '</tr></thead><tbody>' : '</tr>';
            for (let col = 0; col < columnCount; col++) {
                const cell = row[col];
                const value = cell?.value ?? '';
                const text = header ? escapeHtml(value || `Column ${col + 1}`) : this.renderCell(value);
                rowHtml += `<${tag} data-start-line="${cell?.startLine ?? last.endLine}" data-start-char="${cell?.startChar ?? last.endChar}" data-end-line="${cell?.endLine ?? last.endLine}" data-end-char="${cell?.endChar ?? last.endChar}">${text}</${tag}>`;
                if (html.length + rowHtml.length + rowEnd.length > budget) {
                    return rowIndex <= 1 ? null : html + footer + notice(rowIndex - 1);
                }
            }
            html += rowHtml + rowEnd;
        }
        return html + footer + (sourceTruncated ? notice(rows.length - 1) : '');
    }

    /**
     * 渲染单元格并返回可展示内容
     * @param value - 待处理的值
     * @returns 返回单元格的渲染 HTML
     */
    private static renderCell(value: string): string {
        if (value.length === 0) {
            return '<span class="table-empty-cell">&nbsp;</span>';
        }
        return escapeHtml(value).replace(/\n/g, '<br>');
    }
}
