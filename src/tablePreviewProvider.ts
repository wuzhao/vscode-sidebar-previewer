import { PreviewResult } from './fileTypes';
import { escapeHtml } from './utils';

type TabularFileType = 'csv' | 'tsv';

export class TablePreviewProvider {
    private static readonly MAX_HTML_LENGTH = 10 * 1024 * 1024;

    /** 解析输入内容并返回结构化结果。 */
    static parse(content: string, fileType: TabularFileType): PreviewResult {
        try {
            const delimiter = fileType === 'csv' ? ',' : '\t';
            const rows = this.parseRows(content, delimiter);

            if (rows.length === 0) {
                return {
                    html: '<div class="empty-state"><div class="empty-text">No tabular rows to preview.</div></div>',
                    fileType,
                    supportsLocate: false,
                };
            }

            const html = this.renderTable(rows);
            if (html.length > this.MAX_HTML_LENGTH) {
                return {
                    html: '<div class="error-state"><div class="error-text">Preview content is too large to render safely.</div></div>',
                    fileType,
                    supportsLocate: false,
                };
            }

            return {
                html,
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

    /** 解析行数据并返回结构化结果。 */
    private static parseRows(content: string, delimiter: string): string[][] {
        const source = content.replace(/^\uFEFF/, '');
        if (source.length === 0) {
            return [];
        }

        const rows: string[][] = [];
        let row: string[] = [];
        let cell = '';
        let inQuotes = false;

        let i = 0;
        while (i < source.length) {
            const ch = source[i];

            if (inQuotes) {
                if (ch === '"') {
                    const next = i + 1 < source.length ? source[i + 1] : '';
                    if (next === '"') {
                        cell += '"';
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                    i += 1;
                    continue;
                }

                cell += ch;
                i += 1;
                continue;
            }

            if (ch === '"') {
                inQuotes = true;
                i += 1;
                continue;
            }

            if (ch === delimiter) {
                row.push(cell);
                cell = '';
                i += 1;
                continue;
            }

            if (ch === '\n') {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
                i += 1;
                continue;
            }

            if (ch === '\r') {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
                i += 1;
                if (i < source.length && source[i] === '\n') {
                    i += 1;
                }
                continue;
            }

            cell += ch;
            i += 1;
        }

        if (inQuotes) {
            throw new Error('Unterminated quoted field.');
        }

        row.push(cell);
        if (row.length > 1 || row[0].length > 0 || !this.endsWithNewline(source)) {
            rows.push(row);
        }

        return rows;
    }

    /** 判断源文本是否以换行结尾。 */
    private static endsWithNewline(source: string): boolean {
        return source.endsWith('\n') || source.endsWith('\r');
    }

    /** 渲染表格并返回可展示内容。 */
    private static renderTable(rows: string[][]): string {
        const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
        if (columnCount === 0) {
            return '<div class="empty-state"><div class="empty-text">No tabular rows to preview.</div></div>';
        }

        const normalizedRows = rows.map(row => {
            if (row.length >= columnCount) {
                return row;
            }
            return [...row, ...new Array(columnCount - row.length).fill('')];
        });

        const header = normalizedRows[0];
        const body = normalizedRows.slice(1);

        let html = '<div class="table-preview"><table class="tabular-table"><thead><tr><th class="table-index-column">#</th>';
        for (let i = 0; i < header.length; i++) {
            const title = header[i].length > 0 ? header[i] : `Column ${i + 1}`;
            html += `<th>${escapeHtml(title)}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (let rowIndex = 0; rowIndex < body.length; rowIndex++) {
            const row = body[rowIndex];
            html += `<tr><td class="table-index-column">${rowIndex + 1}</td>`;
            for (const cell of row) {
                html += `<td>${this.renderCell(cell)}</td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        return html;
    }

    /** 渲染单元格并返回可展示内容。 */
    private static renderCell(value: string): string {
        if (value.length === 0) {
            return '<span class="table-empty-cell">&nbsp;</span>';
        }
        return escapeHtml(value).replace(/\n/g, '<br>');
    }
}
