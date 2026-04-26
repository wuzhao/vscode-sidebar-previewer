import { PreviewResult } from './fileTypes';
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
 * 提供 TablePreview 相关预览能力
 */
export class TablePreviewProvider {
    private static readonly MAX_HTML_LENGTH = 10 * 1024 * 1024;

    /**
     * 解析输入内容并返回结构化结果
     * @param content - 待解析的文件内容
     * @param fileType - 当前文件类型标识
     * @returns 返回解析后的预览结果
     */
    static parse(content: string, fileType: TabularFileType): PreviewResult {
        try {
            const delimiter = fileType === 'csv' ? ',' : '\t';
            const rows = this.parseRows(content, delimiter);

            if (rows.length === 0) {
                return {
                    html: '<div class="empty-state"><div class="empty-text">No tabular rows to preview.</div></div>',
                    fileType,
                    supportsLocate: true,
                };
            }

            const html = this.renderTable(rows);
            if (html.length > this.MAX_HTML_LENGTH) {
                return {
                    html: '<div class="error-state"><div class="error-text">Preview content is too large to render safely.</div></div>',
                    fileType,
                    supportsLocate: true,
                };
            }

            return {
                html,
                fileType,
                supportsLocate: true,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                html: `<div class="error-state"><div class="error-text">Failed to parse ${fileType.toUpperCase()} content.</div><pre class="error-detail">${escapeHtml(message)}</pre></div>`,
                fileType,
                supportsLocate: true,
            };
        }
    }

    /**
     * 解析行数据并返回结构化结果
     * @param content - 待解析的文件内容
     * @param delimiter - CSV/TSV 字段分隔符
     * @returns 返回按行解析后的表格数据
     * @throws 当 CSV/TSV 引号字段未闭合时抛出异常
     */
    private static parseRows(content: string, delimiter: string): CellData[][] {
        if (content.length === 0 || (content.length === 1 && content.charCodeAt(0) === 0xFEFF)) {
            return [];
        }

        const rows: CellData[][] = [];
        let row: CellData[] = [];
        let cell = '';
        let inQuotes = false;

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
                continue;
            }

            cell += ch;
            advance(ch);
            i += 1;
        }

        if (inQuotes) {
            throw new Error('Unterminated quoted field.');
        }

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

        return rows;
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
     * @param rows - 表格行数据集合
     * @returns 返回可渲染的表格 HTML
     */
    private static renderTable(rows: CellData[][]): string {
        const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
        if (columnCount === 0) {
            return '<div class="empty-state"><div class="empty-text">No tabular rows to preview.</div></div>';
        }

        const normalizedRows = rows.map(row => {
            if (row.length >= columnCount) {
                return row;
            }
            const lastCell = row[row.length - 1];
            const emptyCells: CellData[] = new Array(columnCount - row.length).fill(null).map(() => ({
                value: '',
                startLine: lastCell ? lastCell.endLine : 0,
                startChar: lastCell ? lastCell.endChar : 0,
                endLine: lastCell ? lastCell.endLine : 0,
                endChar: lastCell ? lastCell.endChar : 0
            }));
            return [...row, ...emptyCells];
        });

        const header = normalizedRows[0];
        const body = normalizedRows.slice(1);

        let html = '<div class="table-preview"><div class="table-preview-scroll"><table class="tabular-table"><thead><tr><th class="table-index-column">#</th>';
        for (let i = 0; i < header.length; i++) {
            const cell = header[i];
            const title = cell.value.length > 0 ? cell.value : `Column ${i + 1}`;
            html += `<th data-start-line="${cell.startLine}" data-start-char="${cell.startChar}" data-end-line="${cell.endLine}" data-end-char="${cell.endChar}">${escapeHtml(title)}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (let rowIndex = 0; rowIndex < body.length; rowIndex++) {
            const row = body[rowIndex];
            html += `<tr><td class="table-index-column">${rowIndex + 1}</td>`;
            for (const cell of row) {
                html += `<td data-start-line="${cell.startLine}" data-start-char="${cell.startChar}" data-end-line="${cell.endLine}" data-end-char="${cell.endChar}">${this.renderCell(cell.value)}</td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div></div>';
        return html;
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
