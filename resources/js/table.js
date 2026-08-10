// 表格选区与复制模块
// 负责 CSV/TSV 表格的拖拽选区、编辑器同步、剪贴板复制（兼容 Excel 格式），
// 并拦截表格单元格内的编辑行为

(function() {

// 表格拖拽选区状态
let tableDragState = {
    isDragging: false,
    startCell: null,
    currentCell: null,
    wasMultiCellDrag: false
};

// 可见行探测点向下偏移，避免命中表头边框
const TABLE_VISIBLE_LINE_PROBE_OFFSET_PX = 1;
const TABLE_SELECTION_ACTION_MARGIN_PX = 5;
// 复制成功状态展示时长（毫秒）
const TABLE_SELECTION_COPY_SUCCESS_MS = 800;
// 分体复制菜单离开后延迟关闭的时间（毫秒）
const TABLE_COPY_DROPDOWN_HIDE_DELAY_MS = 200;
// 记录分体复制控件的成功提示计时器
const TABLE_COPY_SUCCESS_TIMER_MAP = new WeakMap();

// 多选快捷操作按钮状态
let tableSelectionUi = {
    container: null,
    wrapper: null,
    tsvButton: null,
    asciiButton: null,
    markdownButton: null,
    dropdown: null,
};
let tableSelectionFocusEventsBound = false;

/**
 * 从单元格提取纯文本值，并将 Markdown 表格 checkbox 还原为任务标记
 * @param cell - 目标单元格
 * @returns 返回标准化后的单元格文本
 */
function getCellPlainText(cell) {
    if (!cell || cell.querySelector('.table-empty-cell')) {
        return '';
    }
    const raw = cell.textContent || '';
    const text = raw.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const checkbox = cell.querySelector('.table-task-checkbox');
    if (!checkbox) {
        return text;
    }

    const taskMarker = checkbox.checked ? '- [x]' : '- [ ]';
    const taskText = text.trim();
    return taskText ? `${taskMarker} ${taskText}` : taskMarker;
}

/**
 * 获取当前选中单元格集合
 * @returns 返回选中单元格数组
 */
function getSelectedCells() {
    return Array.from(document.querySelectorAll('.tabular-table .selected'));
}

/**
 * 判断预览面板是否处于聚焦态
 * @returns 返回预览面板聚焦状态
 */
function isPreviewContentFocused() {
    const content = document.getElementById('content');
    return !!(content && content.classList.contains('preview-focused'));
}

/**
 * 计算选区边界
 * @param selectedCells - 选中单元格集合
 * @returns 返回选区边界
 */
function getSelectionBounds(selectedCells) {
    let minRow = Infinity, maxRow = -Infinity;
    let minCol = Infinity, maxCol = -Infinity;
    selectedCells.forEach(cell => {
        const r = cell.parentElement.rowIndex;
        const c = cell.cellIndex;
        if (r < minRow) { minRow = r; }
        if (r > maxRow) { maxRow = r; }
        if (c < minCol) { minCol = c; }
        if (c > maxCol) { maxCol = c; }
    });
    return { minRow, maxRow, minCol, maxCol };
}

/**
 * 构建选区二维网格
 * @param selectedCells - 选中单元格集合
 * @returns 返回选区网格
 */
function buildSelectionGrid(selectedCells) {
    if (!selectedCells || selectedCells.length === 0) {
        return [];
    }

    const bounds = getSelectionBounds(selectedCells);
    const rowCount = bounds.maxRow - bounds.minRow + 1;
    const colCount = bounds.maxCol - bounds.minCol + 1;
    const grid = Array.from({ length: rowCount }, () => Array(colCount).fill(''));

    selectedCells.forEach(cell => {
        const r = cell.parentElement.rowIndex - bounds.minRow;
        const c = cell.cellIndex - bounds.minCol;
        grid[r][c] = getCellPlainText(cell);
    });

    return grid;
}

/**
 * 构建带表头的复制数据快照
 * @param selectedCells - 选中单元格集合
 * @returns 返回带表头的复制快照
 */
function buildSelectionCopySnapshot(selectedCells) {
    if (!selectedCells || selectedCells.length === 0) {
        return {
            headerRow: [],
            bodyGrid: []
        };
    }

    const bounds = getSelectionBounds(selectedCells);
    const colCount = bounds.maxCol - bounds.minCol + 1;
    const table = selectedCells[0] && selectedCells[0].closest('table');
    const headerCells = table ? Array.from(table.querySelectorAll('thead th')) : [];
    const headerRow = new Array(colCount).fill('').map((_, index) => {
        const headerCell = headerCells[bounds.minCol + index];
        return getCellPlainText(headerCell);
    });

    const bodyCells = selectedCells.filter(cell => cell.parentElement && cell.parentElement.rowIndex > 0);
    if (bodyCells.length === 0) {
        return {
            headerRow,
            bodyGrid: []
        };
    }

    let minBodyRow = Infinity;
    let maxBodyRow = -Infinity;
    bodyCells.forEach(cell => {
        const rowIndex = cell.parentElement.rowIndex;
        if (rowIndex < minBodyRow) {
            minBodyRow = rowIndex;
        }
        if (rowIndex > maxBodyRow) {
            maxBodyRow = rowIndex;
        }
    });

    const rowCount = maxBodyRow - minBodyRow + 1;
    const bodyGrid = Array.from({ length: rowCount }, () => Array(colCount).fill(''));
    bodyCells.forEach(cell => {
        const row = cell.parentElement.rowIndex - minBodyRow;
        const col = cell.cellIndex - bounds.minCol;
        if (row >= 0 && row < rowCount && col >= 0 && col < colCount) {
            bodyGrid[row][col] = getCellPlainText(cell);
        }
    });

    return {
        headerRow,
        bodyGrid
    };
}

/**
 * 从 Markdown 预览表格构建完整复制快照
 * @param table - Markdown 预览表格元素
 * @returns 返回包含表头和正文的复制快照
 */
function buildMarkdownPreviewTableSnapshot(table) {
    const headerRow = Array.from(table.querySelectorAll('thead th')).map(getCellPlainText);
    const bodyGrid = Array.from(table.querySelectorAll('tbody tr')).map(row => {
        return Array.from(row.querySelectorAll('th, td')).map(getCellPlainText);
    });
    return {
        headerRow,
        bodyGrid
    };
}

/**
 * 拆分 Markdown 表格源码行并保留转义后的竖线
 * @param line - 单行 Markdown 表格源码
 * @returns 返回去除外围空白的单元格源码数组
 */
function parseMarkdownTableSourceRow(line) {
    const source = String(line || '').trim();
    const cells = [];
    let currentCell = '';
    let consecutiveBackslashes = 0;
    let lastCharacterWasDelimiter = false;

    for (const char of source) {
        if (char === '|' && consecutiveBackslashes % 2 === 0) {
            cells.push(currentCell.trim());
            currentCell = '';
            consecutiveBackslashes = 0;
            lastCharacterWasDelimiter = true;
            continue;
        }

        currentCell += char;
        lastCharacterWasDelimiter = false;
        if (char === '\\') {
            consecutiveBackslashes++;
        } else {
            consecutiveBackslashes = 0;
        }
    }
    cells.push(currentCell.trim());

    if (source.startsWith('|')) {
        cells.shift();
    }
    if (lastCharacterWasDelimiter) {
        cells.pop();
    }
    return cells;
}

/**
 * 从 GFM 表格源码提取表头和正文单元格
 * @param source - Markdown 表格原始代码片段
 * @returns 返回保留行内语法的表格数据，源码无效时返回 null
 */
function parseMarkdownTableSource(source) {
    const lines = String(source || '').split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
    if (lines.length < 2) {
        return null;
    }
    return {
        headerRow: parseMarkdownTableSourceRow(lines[0]),
        bodyGrid: lines.slice(2).map(parseMarkdownTableSourceRow)
    };
}

/**
 * 获取 Markdown 预览表格的原始代码片段
 * @param table - Markdown 预览表格元素
 * @returns 返回保留行内格式的 Markdown 表格代码
 */
function getMarkdownPreviewTableSource(table) {
    const markdownTableData = table.getAttribute('data-markdown-table');
    if (markdownTableData !== null) {
        try {
            const tableData = JSON.parse(markdownTableData);
            const sourceTable = parseMarkdownTableSource(tableData.source);
            if (sourceTable) {
                return buildMarkdownTableText(
                    sourceTable.headerRow,
                    sourceTable.bodyGrid,
                    tableData.alignments,
                    true
                );
            }
        } catch (_) {
            // 表格源码元数据异常时沿用渲染内容重建，避免复制入口失效
        }
    }

    const snapshot = buildMarkdownPreviewTableSnapshot(table);
    return buildMarkdownTableText(snapshot.headerRow, snapshot.bodyGrid);
}

/**
 * 合并表头和正文为完整网格
 * @param snapshot - 复制快照
 * @returns 返回完整网格
 */
function buildGridWithHeader(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.headerRow) || snapshot.headerRow.length === 0) {
        return [];
    }
    return [snapshot.headerRow, ...(Array.isArray(snapshot.bodyGrid) ? snapshot.bodyGrid : [])];
}

/**
 * 将选区网格转换为 TSV 文本
 * @param grid - 选区网格
 * @returns 返回 TSV 字符串
 */
function buildTsvText(grid) {
    return grid.map(row => row.join('\t')).join('\r\n');
}

/**
 * 转义 CSV 单元格中的引号与分隔字符
 * @param value - 原始单元格值
 * @returns 返回符合 CSV 规则的单元格文本
 */
function escapeCsvCell(value) {
    const text = String(value ?? '');
    if (!/[",\r\n]/.test(text)) {
        return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 将选区网格转换为 CSV 文本
 * @param grid - 选区网格
 * @returns 返回 CSV 字符串
 */
function buildCsvText(grid) {
    return grid.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * 判断字符是否为零宽组合字符
 * @param codePoint - 目标字符码点
 * @returns 返回是否为零宽组合字符
 */
function isCombiningMarkCodePoint(codePoint) {
    return (
        (codePoint >= 0x0300 && codePoint <= 0x036F) ||
        (codePoint >= 0x1AB0 && codePoint <= 0x1AFF) ||
        (codePoint >= 0x1DC0 && codePoint <= 0x1DFF) ||
        (codePoint >= 0x20D0 && codePoint <= 0x20FF) ||
        (codePoint >= 0xFE20 && codePoint <= 0xFE2F)
    );
}

/**
 * 判断字符是否为全角宽字符
 * @param codePoint - 目标字符码点
 * @returns 返回是否为全角宽字符
 */
function isFullWidthCodePoint(codePoint) {
    if (codePoint >= 0x1100 && (
        codePoint <= 0x115F ||
        codePoint === 0x2329 ||
        codePoint === 0x232A ||
        (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F) ||
        (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
        (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
        (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
        (codePoint >= 0xFE30 && codePoint <= 0xFE6F) ||
        (codePoint >= 0xFF00 && codePoint <= 0xFF60) ||
        (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
        (codePoint >= 0x1F300 && codePoint <= 0x1F64F) ||
        (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
        (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
    )) {
        return true;
    }
    return false;
}

/**
 * 计算字符串显示宽度
 * @param value - 目标字符串
 * @returns 返回显示宽度
 */
function getDisplayWidth(value) {
    let width = 0;
    for (const char of String(value || '')) {
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined) {
            continue;
        }
        if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F) || isCombiningMarkCodePoint(codePoint)) {
            continue;
        }
        width += isFullWidthCodePoint(codePoint) ? 2 : 1;
    }
    return width;
}

/**
 * 生成 Markdown 表格行
 * @param row - 当前行
 * @returns 返回 Markdown 行文本
 */
function formatMarkdownTableRow(row) {
    return `| ${row.join(' | ')} |`;
}

/**
 * 转义 Markdown 表格单元格内容
 * @param value - 原始单元格值
 * @returns 返回转义后的内容
 */
function escapeMarkdownTableCell(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|');
}

/**
 * 按列宽和对齐方式补齐 Markdown 单元格
 * @param value - 保留 Markdown 语法的单元格文本
 * @param width - 当前列的目标显示宽度
 * @param alignment - 当前列的对齐方式
 * @returns 返回按显示宽度补齐空格的单元格文本
 */
function padMarkdownTableCell(value, width, alignment) {
    const text = String(value ?? '');
    const padding = Math.max(0, width - getDisplayWidth(text));
    if (alignment === 'right') {
        return ' '.repeat(padding) + text;
    }
    if (alignment === 'center') {
        const leftPadding = Math.floor(padding / 2);
        return ' '.repeat(leftPadding) + text + ' '.repeat(padding - leftPadding);
    }
    return text + ' '.repeat(padding);
}

/**
 * 按列宽生成标准 Markdown 表格分隔单元格
 * @param width - 当前列的目标显示宽度
 * @param alignment - 当前列的对齐方式
 * @returns 返回保留右对齐或居中标记的标准分隔内容
 */
function buildMarkdownSeparatorCell(width, alignment) {
    if (alignment === 'right') {
        return '-'.repeat(Math.max(3, width - 1)) + ':';
    }
    if (alignment === 'center') {
        return ':' + '-'.repeat(Math.max(3, width - 2)) + ':';
    }
    return '-'.repeat(Math.max(3, width));
}

/**
 * 将表头和正文转换为 Markdown Table 文本
 * @param headerRow - 表头行
 * @param bodyGrid - 正文网格
 * @param alignments - 各列需要保留的对齐方式
 * @param preserveCellFormatting - 是否保留单元格内已有的 Markdown 语法
 * @returns 返回 Markdown Table 字符串
 */
function buildMarkdownTableText(headerRow, bodyGrid, alignments = [], preserveCellFormatting = false) {
    if (!Array.isArray(headerRow) || headerRow.length === 0) {
        return '';
    }
    const colCount = headerRow.length;
    const normalizeRow = (row) => {
        const safeRow = Array.isArray(row) ? row : [];
        return new Array(colCount).fill('').map((_, index) => {
            const value = safeRow[index] ?? '';
            return preserveCellFormatting ? String(value) : escapeMarkdownTableCell(value);
        });
    };

    const normalizedHeader = normalizeRow(headerRow);
    const normalizedBody = (Array.isArray(bodyGrid) ? bodyGrid : []).map(normalizeRow);
    const normalizedAlignments = new Array(colCount).fill(null).map((_, index) => {
        const alignment = Array.isArray(alignments) ? alignments[index] : null;
        return alignment === 'right' || alignment === 'center' ? alignment : null;
    });
    const columnWidths = new Array(colCount).fill(0).map((_, index) => {
        const alignment = normalizedAlignments[index];
        const minimumWidth = alignment === 'center' ? 5 : alignment === 'right' ? 4 : 3;
        return [normalizedHeader, ...normalizedBody].reduce((width, row) => {
            return Math.max(width, getDisplayWidth(row[index] ?? ''));
        }, minimumWidth);
    });

    const lines = [
        formatMarkdownTableRow(normalizedHeader.map((value, index) => {
            return padMarkdownTableCell(value, columnWidths[index], normalizedAlignments[index]);
        })),
        formatMarkdownTableRow(columnWidths.map((width, index) => {
            return buildMarkdownSeparatorCell(width, normalizedAlignments[index]);
        }))
    ];

    normalizedBody.forEach(row => {
        lines.push(formatMarkdownTableRow(row.map((value, index) => {
            return padMarkdownTableCell(value, columnWidths[index], normalizedAlignments[index]);
        })));
    });
    return lines.join('\n');
}

/**
 * 构建 ASCII 表格边框
 * @param widths - 各列宽度
 * @param left - 左边框字符
 * @param middle - 中间分隔字符
 * @param right - 右边框字符
 * @returns 返回边框文本
 */
function buildAsciiBorder(widths, left, middle, right) {
    const cells = widths.map(width => '─'.repeat(Math.max(1, width + 2)));
    return `${left}${cells.join(middle)}${right}`;
}

/**
 * 将选区网格转换为 ASCII Table 文本
 * @param grid - 选区网格
 * @returns 返回 ASCII Table 字符串
 */
function buildAsciiTableText(grid) {
    if (!grid || grid.length === 0) {
        return '';
    }
    const colCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
    const widths = new Array(colCount).fill(0);

    grid.forEach(row => {
        for (let i = 0; i < colCount; i++) {
            const value = row[i] ?? '';
            widths[i] = Math.max(widths[i], getDisplayWidth(value));
        }
    });

    const topBorder = buildAsciiBorder(widths, '┌', '┬', '┐');
    const middleBorder = buildAsciiBorder(widths, '├', '┼', '┤');
    const bottomBorder = buildAsciiBorder(widths, '└', '┴', '┘');
    const lines = [topBorder];
    grid.forEach(row => {
        const line = row.concat(new Array(Math.max(0, colCount - row.length)).fill('')).map((value, index) => {
            const safeValue = String(value ?? '');
            const padding = Math.max(0, widths[index] - getDisplayWidth(safeValue));
            return safeValue + ' '.repeat(padding);
        });
        lines.push('│ ' + line.join(' │ ') + ' │');
        lines.push(middleBorder);
    });
    lines[lines.length - 1] = bottomBorder;
    return lines.join('\n');
}

/**
 * 写入文本到系统剪贴板
 * @param text - 待复制文本
 */
async function writeTextToClipboard(text) {
    if (typeof text !== 'string') {
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch (_) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', 'readonly');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}

/**
 * 创建表格复制菜单中的格式操作按钮
 * @param label - 复制格式名称
 * @param description - 格式用途的辅助说明
 * @returns 返回菜单操作按钮
 */
function createTableCopyMenuButton(label, description = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-copy-menu-item';
    button.title = label;

    const icon = document.createElement('i');
    icon.className = 'codicon codicon-copy';
    const text = document.createElement('span');
    text.className = 'table-copy-menu-text';
    const labelElement = document.createElement('span');
    labelElement.className = 'table-copy-menu-label';
    labelElement.textContent = label;
    text.appendChild(labelElement);

    if (description) {
        button.classList.add('has-description');
        const descriptionElement = document.createElement('span');
        descriptionElement.className = 'table-copy-menu-description';
        descriptionElement.textContent = description;
        text.appendChild(descriptionElement);
    }

    button.appendChild(icon);
    button.appendChild(text);
    return button;
}

/**
 * 按统一顺序创建表格复制格式菜单
 * @returns 返回菜单容器及各格式操作按钮
 */
function createTableCopyMenuElements() {
    const menu = document.createElement('div');
    menu.className = 'table-copy-menu';
    const markdownButton = createTableCopyMenuButton(L10N_TEXT.tableSelectionMarkdown);
    const asciiButton = createTableCopyMenuButton(L10N_TEXT.tableSelectionAscii);
    const tsvButton = createTableCopyMenuButton(L10N_TEXT.tableSelectionTsv, L10N_TEXT.tableSelectionTsvHint);
    const csvButton = createTableCopyMenuButton(L10N_TEXT.tableSelectionCsv);

    menu.appendChild(markdownButton);
    menu.appendChild(asciiButton);
    menu.appendChild(tsvButton);
    menu.appendChild(csvButton);
    return {
        menu,
        markdownButton,
        asciiButton,
        tsvButton,
        csvButton
    };
}

/**
 * 为表格复制按钮绑定格式转换与反馈交互
 * @param copyButton - 目标复制按钮
 * @param buildText - 根据当前表格或选区生成复制文本的函数
 */
function bindTableCopyButton(copyButton, buildText) {
    copyButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actions = copyButton.closest('.table-copy-actions');
        if (actions && actions.classList.contains('copied')) {
            return;
        }
        const text = buildText();
        if (typeof text !== 'string') {
            return;
        }
        await writeTextToClipboard(text);
        showTableCopySuccess(copyButton);
    });
}

/**
 * 为分体复制控件添加整组成功提示并绑定菜单悬停行为
 * @param actions - 分体复制控件容器
 * @param dropdown - 分体复制控件的下拉菜单
 */
function bindTableCopyActionGroup(actions, dropdown) {
    const feedback = document.createElement('div');
    feedback.className = 'table-copy-feedback';
    feedback.innerHTML = `<i class="codicon codicon-pass-filled"></i><span>${L10N_TEXT.copySuccess}</span>`;
    actions.appendChild(feedback);

    let dropdownHideTimer = null;

    actions.addEventListener('mouseenter', () => {
        if (dropdownHideTimer) {
            clearTimeout(dropdownHideTimer);
            dropdownHideTimer = null;
        }
    });
    actions.addEventListener('mouseleave', () => {
        dropdownHideTimer = setTimeout(() => {
            dropdown.removeAttribute('open');
            dropdownHideTimer = null;
        }, TABLE_COPY_DROPDOWN_HIDE_DELAY_MS);
    });
}

/**
 * 为单个 Markdown 预览表格创建主复制按钮和格式下拉菜单
 * @param table - Markdown 预览表格元素
 */
function ensureMarkdownTableCopyActions(table) {
    if (table.dataset.copyActionsBound) {
        return;
    }

    const parent = table.parentElement;
    if (!parent) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-copy-wrapper';
    parent.insertBefore(wrapper, table);
    wrapper.appendChild(table);

    const actions = document.createElement('div');
    actions.className = 'markdown-table-copy-actions table-copy-actions';

    const markdownButton = document.createElement('button');
    markdownButton.type = 'button';
    markdownButton.className = 'table-copy-button table-copy-main';
    markdownButton.title = L10N_TEXT.tableSelectionMarkdown;
    markdownButton.innerHTML = '<i class="codicon codicon-copy"></i>';

    const dropdown = document.createElement('details');
    dropdown.className = 'table-copy-dropdown';

    const dropdownTrigger = document.createElement('summary');
    dropdownTrigger.className = 'table-copy-trigger';
    dropdownTrigger.title = L10N_TEXT.tableSelectionMore;
    dropdownTrigger.setAttribute('aria-label', L10N_TEXT.tableSelectionMore);
    dropdownTrigger.innerHTML = '<i class="codicon codicon-chevron-down"></i>';

    const copyMenu = createTableCopyMenuElements();
    dropdown.appendChild(dropdownTrigger);
    dropdown.appendChild(copyMenu.menu);
    actions.appendChild(markdownButton);
    actions.appendChild(dropdown);
    bindTableCopyActionGroup(actions, dropdown);
    wrapper.appendChild(actions);

    bindTableCopyButton(markdownButton, () => getMarkdownPreviewTableSource(table));
    bindTableCopyButton(copyMenu.markdownButton, () => getMarkdownPreviewTableSource(table));
    bindTableCopyButton(copyMenu.asciiButton, () => {
        const snapshot = buildMarkdownPreviewTableSnapshot(table);
        return buildAsciiTableText(buildGridWithHeader(snapshot));
    });
    bindTableCopyButton(copyMenu.tsvButton, () => {
        const snapshot = buildMarkdownPreviewTableSnapshot(table);
        return buildTsvText(buildGridWithHeader(snapshot));
    });
    bindTableCopyButton(copyMenu.csvButton, () => {
        const snapshot = buildMarkdownPreviewTableSnapshot(table);
        return buildCsvText(buildGridWithHeader(snapshot));
    });

    table.dataset.copyActionsBound = 'true';
}

/**
 * 为 Markdown 正文中的所有渲染表格绑定悬浮复制入口
 */
function bindMarkdownTableCopyActions() {
    const tables = document.querySelectorAll('#content table:not(.frontmatter):not(.tabular-table)');
    tables.forEach(ensureMarkdownTableCopyActions);
}

/**
 * 隐藏多选操作按钮
 */
function hideTableSelectionActions() {
    if (tableSelectionUi.wrapper) {
        tableSelectionUi.wrapper.classList.remove('is-visible');
        clearTableCopySuccessTimer(tableSelectionUi.wrapper);
        resetTableCopySuccess(tableSelectionUi.wrapper);
    }
    if (tableSelectionUi.dropdown) {
        tableSelectionUi.dropdown.removeAttribute('open');
    }
}

/**
 * 响应焦点变化并刷新多选按钮显隐
 */
function handleTableSelectionFocusChange() {
    updateTableSelectionActions();
}

/**
 * 绑定焦点变化监听
 * 让多选按钮显隐始终跟随预览面板聚焦状态
 */
function bindTableSelectionFocusEvents() {
    if (tableSelectionFocusEventsBound) {
        return;
    }

    tableSelectionFocusEventsBound = true;
    document.addEventListener('focusin', handleTableSelectionFocusChange);
    document.addEventListener('focusout', () => {
        setTimeout(handleTableSelectionFocusChange, 0);
    });
    window.addEventListener('focus', () => {
        setTimeout(handleTableSelectionFocusChange, 0);
    });
    window.addEventListener('blur', handleTableSelectionFocusChange);
}

/**
 * 清除分体复制控件的成功提示状态
 * @param actions - 分体复制控件容器
 */
function resetTableCopySuccess(actions) {
    actions.classList.remove('copied');
    if (actions.classList.contains('table-selection-actions') && actions.classList.contains('is-visible')) {
        updateTableSelectionActions();
    }
}

/**
 * 清理分体复制控件的成功提示计时器
 * @param actions - 分体复制控件容器
 */
function clearTableCopySuccessTimer(actions) {
    const timers = TABLE_COPY_SUCCESS_TIMER_MAP.get(actions);
    if (!timers) {
        return;
    }
    if (timers.resetTimer) {
        clearTimeout(timers.resetTimer);
    }
    TABLE_COPY_SUCCESS_TIMER_MAP.delete(actions);
}

/**
 * 调度分体复制控件的成功提示复原
 * @param actions - 分体复制控件容器
 */
function scheduleTableCopySuccessReset(actions) {
    const timers = TABLE_COPY_SUCCESS_TIMER_MAP.get(actions);
    if (!timers) {
        return;
    }

    if (timers.resetTimer) {
        clearTimeout(timers.resetTimer);
    }

    timers.resetTimer = setTimeout(() => {
        resetTableCopySuccess(actions);
        TABLE_COPY_SUCCESS_TIMER_MAP.delete(actions);
    }, TABLE_SELECTION_COPY_SUCCESS_MS);
}

/**
 * 将整个分体复制控件切换为成功提示
 * @param copyBtn - 目标复制按钮
 */
function showTableCopySuccess(copyBtn) {
    const actions = copyBtn.closest('.table-copy-actions');
    if (!actions) {
        return;
    }
    clearTableCopySuccessTimer(actions);
    const dropdown = actions.querySelector('.table-copy-dropdown');
    if (dropdown) {
        dropdown.removeAttribute('open');
    }
    actions.classList.add('copied');
    if (actions.classList.contains('table-selection-actions') && actions.classList.contains('is-visible')) {
        updateTableSelectionActions();
    }
    TABLE_COPY_SUCCESS_TIMER_MAP.set(actions, {
        resetTimer: null
    });
    scheduleTableCopySuccessReset(actions);
}

/**
 * 确保多选操作按钮存在
 * @param table - 当前表格
 */
function ensureTableSelectionActionElements(table) {
    const container = getTableScrollContainer(table);
    if (!container) {
        return;
    }

    if (
        tableSelectionUi.container === container
        && tableSelectionUi.wrapper
        && tableSelectionUi.tsvButton
        && tableSelectionUi.asciiButton
        && tableSelectionUi.markdownButton
        && tableSelectionUi.dropdown
    ) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-selection-actions table-copy-actions';

    const tsvButton = document.createElement('button');
    tsvButton.type = 'button';
    tsvButton.className = 'table-copy-button table-copy-main';
    tsvButton.title = L10N_TEXT.tableSelectionTsv;
    tsvButton.innerHTML = '<i class="codicon codicon-copy"></i>';

    const dropdown = document.createElement('details');
    dropdown.className = 'table-copy-dropdown';

    const dropdownTrigger = document.createElement('summary');
    dropdownTrigger.className = 'table-copy-trigger';
    dropdownTrigger.title = L10N_TEXT.tableSelectionMore;
    dropdownTrigger.setAttribute('aria-label', L10N_TEXT.tableSelectionMore);
    dropdownTrigger.innerHTML = '<i class="codicon codicon-chevron-down"></i>';

    const copyMenu = createTableCopyMenuElements();
    dropdown.appendChild(dropdownTrigger);
    dropdown.appendChild(copyMenu.menu);
    wrapper.appendChild(tsvButton);
    wrapper.appendChild(dropdown);
    bindTableCopyActionGroup(wrapper, dropdown);
    container.appendChild(wrapper);

    bindTableCopyButton(tsvButton, () => {
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return null;
        }
        const snapshot = buildSelectionCopySnapshot(selectedCells);
        return buildTsvText(buildGridWithHeader(snapshot));
    });

    bindTableCopyButton(copyMenu.markdownButton, () => {
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return null;
        }
        const snapshot = buildSelectionCopySnapshot(selectedCells);
        return buildMarkdownTableText(snapshot.headerRow, snapshot.bodyGrid);
    });

    bindTableCopyButton(copyMenu.asciiButton, () => {
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return null;
        }
        const snapshot = buildSelectionCopySnapshot(selectedCells);
        return buildAsciiTableText(buildGridWithHeader(snapshot));
    });

    bindTableCopyButton(copyMenu.tsvButton, () => {
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return null;
        }
        const snapshot = buildSelectionCopySnapshot(selectedCells);
        return buildTsvText(buildGridWithHeader(snapshot));
    });

    bindTableCopyButton(copyMenu.csvButton, () => {
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return null;
        }
        const snapshot = buildSelectionCopySnapshot(selectedCells);
        return buildCsvText(buildGridWithHeader(snapshot));
    });

    tableSelectionUi = {
        container,
        wrapper,
        tsvButton,
        asciiButton: copyMenu.asciiButton,
        markdownButton: copyMenu.markdownButton,
        dropdown,
    };
}

/**
 * 更新多选操作按钮位置和显隐
 */
function updateTableSelectionActions() {
    const table = document.querySelector('.tabular-table');
    if (!table) {
        hideTableSelectionActions();
        return;
    }

    ensureTableSelectionActionElements(table);
    if (!tableSelectionUi.wrapper || !tableSelectionUi.container) {
        return;
    }

    const selectedCells = getSelectedCells();
    if (selectedCells.length < 2) {
        hideTableSelectionActions();
        return;
    }

    const wrapper = tableSelectionUi.wrapper;
    if (!isPreviewContentFocused() && !wrapper.classList.contains('copied')) {
        hideTableSelectionActions();
        return;
    }

    const bounds = selectedCells.reduce((acc, cell) => {
        const rect = cell.getBoundingClientRect();
        acc.right = Math.max(acc.right, rect.right);
        acc.top = Math.min(acc.top, rect.top);
        return acc;
    }, {
        right: Number.NEGATIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
    });

    const containerRect = tableSelectionUi.container.getBoundingClientRect();
    wrapper.classList.add('is-visible');

    // 将按钮组右侧与选区右侧对齐，并在选区内保留横向边距
    let left = bounds.right - containerRect.left + tableSelectionUi.container.scrollLeft
        - wrapper.offsetWidth - TABLE_SELECTION_ACTION_MARGIN_PX;
    // 将按钮组放到选区顶部，并在选区内保留纵向边距
    let top = bounds.top - containerRect.top + tableSelectionUi.container.scrollTop + TABLE_SELECTION_ACTION_MARGIN_PX;
    // 限制最小横向边距，防止按钮贴住容器左边界
    left = Math.max(TABLE_SELECTION_ACTION_MARGIN_PX, left);
    // 限制最小纵向边距，防止按钮贴住容器上边界
    top = Math.max(TABLE_SELECTION_ACTION_MARGIN_PX, top);
    wrapper.style.left = `${left}px`;
    wrapper.style.top = `${top}px`;
}

/**
 * 处理外部发来的表格高亮区域
 */
function highlightTableRangeFunc(startLine, startChar, endLine, endChar) {
    if (isUpdatingSelectionFromWebview) {
        return;
    }

    const table = document.querySelector('.tabular-table');
    if (!table) {
        return;
    }

    const cells = table.querySelectorAll('th[data-start-line], td[data-start-line]');
    cells.forEach(cell => {
        const cSL = Number(cell.getAttribute('data-start-line'));
        const cSC = Number(cell.getAttribute('data-start-char'));
        const cEL = Number(cell.getAttribute('data-end-line'));
        const cEC = Number(cell.getAttribute('data-end-char'));

        function comparePos(l1, c1, l2, c2) {
            if (l1 !== l2) {
                return l1 - l2;
            }
            return c1 - c2;
        }

        if (comparePos(cEL, cEC, startLine, startChar) >= 0 && comparePos(cSL, cSC, endLine, endChar) <= 0) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    });
    updateTableSelectionActions();
}

/**
 * 绑定表格交互
 */
function bindTableSelection() {
    const table = document.querySelector('.tabular-table');
    if (!table) {
        return;
    }

    // Only bind once
    if (table.dataset.selectionBound) {
        return;
    }
    table.dataset.selectionBound = "true";
    ensureTableSelectionActionElements(table);

    table.addEventListener('mousedown', () => {
        if (typeof PreviewCommon !== 'undefined' && PreviewCommon.focusPreviewContent) {
            PreviewCommon.focusPreviewContent();
        }
    });

    table.addEventListener('mousedown', (e) => {
        if (e.button !== 0) {
            return;
        }
        const cell = e.target.closest('th[data-start-line], td[data-start-line]');
        if (!cell) {
            return;
        }
        
        tableDragState.isDragging = true;
        tableDragState.startCell = cell;
        tableDragState.currentCell = cell;
        
        updateTableSelectionVisuals();
        updateTableSelectionActions();
        e.preventDefault(); // prevent text selection
    });

    window.addEventListener('mousemove', (e) => {
        if (!tableDragState.isDragging) {
            return;
        }
        const cell = e.target.closest && e.target.closest('th[data-start-line], td[data-start-line]');
        if (cell && tableDragState.currentCell !== cell) {
            tableDragState.currentCell = cell;
            tableDragState.wasMultiCellDrag = true;
            updateTableSelectionVisuals();
            updateTableSelectionActions();
        }
    });

    window.addEventListener('mouseup', () => {
        if (tableDragState.isDragging) {
            tableDragState.isDragging = false;
            applyTableSelectionToEditor();
            updateTableSelectionActions();
        }
    });

    const container = getTableScrollContainer(table);
    if (container) {
        container.addEventListener('scroll', () => {
            updateTableSelectionActions();
        });
    }
}

/**
 * 获取表格滚动容器并返回结果
 * @param table - 当前表格元素
 * @returns 返回表格滚动容器
 */
function getTableScrollContainer(table) {
    const container = table.closest('.table-preview-scroll');
    return container instanceof HTMLElement ? container : null;
}

/**
 * 获取 sticky 表头高度并返回结果
 * @param table - 当前表格元素
 * @returns 返回 sticky 表头高度
 */
function getStickyHeaderHeight(table) {
    const headerRow = table.querySelector('thead');
    if (!(headerRow instanceof HTMLElement)) {
        return 0;
    }
    return headerRow.getBoundingClientRect().height;
}

/**
 * 获取 sticky 序号列宽度并返回结果
 * @param table - 当前表格元素
 * @returns 返回 sticky 序号列宽度
 */
function getStickyIndexColumnWidth(table) {
    const stickyColumn = table.querySelector('thead .table-index-column, tbody .table-index-column');
    if (!(stickyColumn instanceof HTMLElement)) {
        return 0;
    }
    return stickyColumn.getBoundingClientRect().width;
}

/**
 * 解析单元格起始行号并返回结果
 * @param cell - 目标单元格
 * @returns 返回单元格起始行号
 */
function getCellStartLine(cell) {
    const parsed = parseInt(cell.getAttribute('data-start-line'), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 获取每一行第一列内容单元格并返回结果
 * @param table - 当前表格元素
 * @returns 返回按行排序的第一列内容单元格数组
 */
function getFirstColumnAnchorCells(table) {
    const rows = table.querySelectorAll('tbody tr');
    const anchors = [];
    rows.forEach(row => {
        const firstDataCell = row.querySelector('td[data-start-line]');
        if (firstDataCell instanceof HTMLElement) {
            anchors.push(firstDataCell);
        }
    });

    if (anchors.length > 0) {
        return anchors;
    }

    const headerAnchor = table.querySelector('thead th[data-start-line]');
    if (headerAnchor instanceof HTMLElement) {
        return [headerAnchor];
    }

    return [];
}

function updateTableSelectionVisuals() {
    if (!tableDragState.startCell || !tableDragState.currentCell) {
        return;
    }

    const table = document.querySelector('.tabular-table');
    if (!table) {
        return;
    }

    const startRow = tableDragState.startCell.parentElement.rowIndex;
    const startCol = tableDragState.startCell.cellIndex;
    const currentRow = tableDragState.currentCell.parentElement.rowIndex;
    const currentCol = tableDragState.currentCell.cellIndex;

    const minRow = Math.min(startRow, currentRow);
    const maxRow = Math.max(startRow, currentRow);
    const minCol = Math.min(startCol, currentCol);
    const maxCol = Math.max(startCol, currentCol);

    const cells = table.querySelectorAll('th[data-start-line], td[data-start-line]');
    cells.forEach(cell => {
        const row = cell.parentElement.rowIndex;
        const col = cell.cellIndex;
        if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    });
    updateTableSelectionActions();
}

function applyTableSelectionToEditor() {
    const selectedCells = Array.from(document.querySelectorAll('.tabular-table .selected'));
    if (selectedCells.length === 0) {
        return;
    }

    const selections = selectedCells.map(cell => ({
        startLine: Number(cell.getAttribute('data-start-line')),
        startChar: Number(cell.getAttribute('data-start-char')),
        endLine: Number(cell.getAttribute('data-end-line')),
        endChar: Number(cell.getAttribute('data-end-char'))
    }));

    if (selections.length > 0) {
        isUpdatingSelectionFromWebview = true;
        VSCODE_API.postMessage({
            type: 'updateEditorSelection',
            selections: selections
        });
        
        setTimeout(() => {
            isUpdatingSelectionFromWebview = false;
        }, 150);
    }
}

// 监听浏览器复制事件：当表格单元格被选中时，拦截默认复制行为，
// 以 TSV 纯文本 + HTML 表格双格式写入剪贴板，确保粘贴到 Excel 时保留正确的行列结构
document.addEventListener('copy', (e) => {
    const selectedCells = getSelectedCells();
    if (selectedCells.length === 0) {
        return;
    }
    e.preventDefault();
    if (selectedCells.length === 1) {
        e.clipboardData.setData('text/plain', getCellPlainText(selectedCells[0]));
        return;
    }
    const grid = buildSelectionGrid(selectedCells);
    e.clipboardData.setData('text/plain', buildTsvText(grid));
    if (tableSelectionUi.tsvButton) {
        showTableCopySuccess(tableSelectionUi.tsvButton);
    }
});

// 向公共注册中心登记：仅在 CSV / TSV 文件类型时激活
PreviewCommon.registerDomainInit(['csv', 'tsv'], 'table', function() {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

    // 绑定焦点事件，确保按钮显示受预览聚焦状态控制
    bindTableSelectionFocusEvents();

    // 绑定表格拖拽选区交互
    bindTableSelection();

    // 确保表格单元格不可编辑（显式声明 contenteditable=false）
    table.querySelectorAll('td, th').forEach(cell => {
        cell.setAttribute('contenteditable', 'false');
    });

    // 阻止表格单元格内的键盘编辑行为（仅拦截字符输入、删除、回车等编辑键，保留方向键/Tab/Esc 等导航键）
    table.addEventListener('keydown', (e) => {
        if (!e.target.closest || !e.target.closest('td, th')) {
            return;
        }
        // 允许修饰键组合（Ctrl/Cmd 复制、全选等）
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }
        // 允许导航键和功能键
        const allowList = new Set([
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Tab', 'Escape', 'Home', 'End', 'PageUp', 'PageDown',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
        ]);
        if (allowList.has(e.key)) {
            return;
        }
        // 拦截字符输入、Backspace、Delete、Enter 等编辑键
        e.preventDefault();
    });

    // 阻止表格单元格内所有类型的输入事件（IME合成、粘贴、拖放等）
    table.addEventListener('beforeinput', (e) => {
        e.preventDefault();
    });

    // 绑定单元格点击导航：单击单元格时定位到编辑器中对应行列位置
    table.addEventListener('click', (e) => {
        if (typeof PreviewCommon !== 'undefined' && PreviewCommon.focusPreviewContent) {
            PreviewCommon.focusPreviewContent();
        }
        // 拖拽选区场景下不触发导航
        if (tableDragState.wasMultiCellDrag) {
            tableDragState.wasMultiCellDrag = false;
            return;
        }
        const cell = e.target.closest('th[data-start-line], td[data-start-line]');
        if (!cell) {
            return;
        }
        const line = parseInt(cell.getAttribute('data-start-line'), 10);
        const char = parseInt(cell.getAttribute('data-start-char'), 10);
        if (!isNaN(line) && line >= 0) {
            VSCODE_API.postMessage({
                type: 'navigateToLine',
                line: line,
                char: isNaN(char) ? 0 : char
            });
        }
    });

    updateTableSelectionActions();
});

// 向公共注册中心登记：仅在 Markdown 文件类型时激活表格复制入口
PreviewCommon.registerDomainInit(['markdown'], 'markdown-table-copy', function() {
    bindMarkdownTableCopyActions();
});

/**
 * 将表格滚动到指定行
 * @param line - 目标行号
 */
function scrollToLine(line) {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

    const container = getTableScrollContainer(table);
    if (!container) { return; }

    const anchorCells = getFirstColumnAnchorCells(table);
    if (anchorCells.length === 0) { return; }

    let best = null;
    let bestLine = -1;
    anchorCells.forEach(cell => {
        const cellLine = getCellStartLine(cell);
        if (cellLine === null) {
            return;
        }
        if (cellLine <= line && cellLine > bestLine) {
            bestLine = cellLine;
            best = cell;
        }
    });

    if (!best) {
        best = anchorCells[0];
    }

    const stickyHeaderHeight = getStickyHeaderHeight(table);
    const stickyIndexColumnWidth = getStickyIndexColumnWidth(table);
    const containerRect = container.getBoundingClientRect();
    const targetRect = best.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + container.scrollTop;
    const targetLeft = targetRect.left - containerRect.left + container.scrollLeft;

    container.scrollTop = Math.max(0, targetTop - stickyHeaderHeight);
    container.scrollLeft = Math.max(0, targetLeft - stickyIndexColumnWidth);
}

/**
 * 报告当前可见表格行，回传给扩展端用于编辑定位
 */
function reportVisibleLine() {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

    const container = getTableScrollContainer(table);
    if (!container) { return; }

    const anchorCells = getFirstColumnAnchorCells(table);
    if (anchorCells.length === 0) { return; }

    const containerRect = container.getBoundingClientRect();
    const stickyHeaderHeight = getStickyHeaderHeight(table);
    const probeTop = containerRect.top + stickyHeaderHeight + TABLE_VISIBLE_LINE_PROBE_OFFSET_PX;

    let bestCell = null;
    let bestDistance = Infinity;
    anchorCells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const distance = Math.abs(rect.top - probeTop);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestCell = cell;
        }
    });

    if (bestCell) {
        const line = parseInt(bestCell.getAttribute('data-start-line'), 10);
        const char = parseInt(bestCell.getAttribute('data-start-char'), 10);
        VSCODE_API.postMessage({
            type: 'visibleLine',
            line: isNaN(line) ? 0 : line,
            char: isNaN(char) ? 0 : char
        });
    }
}

// 暴露公共方法
window.PreviewTable = {
    bindTableSelection: bindTableSelection,
    bindMarkdownTableCopyActions: bindMarkdownTableCopyActions,
    highlightTableRangeFunc: highlightTableRangeFunc,
    scrollToLine: scrollToLine,
    reportVisibleLine: reportVisibleLine
};
})();
