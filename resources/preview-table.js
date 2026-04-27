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
const TABLE_SELECTION_ACTION_MARGIN_PX = 6;

// 多选快捷操作按钮状态
let tableSelectionUi = {
    container: null,
    button: null,
    menu: null
};

/**
 * 从单元格提取纯文本值
 * @param cell - 目标单元格
 * @returns 返回标准化后的单元格文本
 */
function getCellPlainText(cell) {
    if (!cell || cell.querySelector('.table-empty-cell')) {
        return '';
    }
    const raw = cell.textContent || '';
    return raw.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/**
 * 获取当前选中单元格集合
 * @returns 返回选中单元格数组
 */
function getSelectedCells() {
    return Array.from(document.querySelectorAll('.tabular-table .selected'));
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
 * 将选区网格转换为 TSV 文本
 * @param grid - 选区网格
 * @returns 返回 TSV 字符串
 */
function buildTsvText(grid) {
    return grid.map(row => row.join('\t')).join('\r\n');
}

/**
 * 计算字符串显示宽度
 * @param value - 目标字符串
 * @returns 返回显示宽度
 */
function getDisplayWidth(value) {
    return Array.from(String(value || '')).length;
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

    const separator = '+-' + widths.map(width => '-'.repeat(Math.max(1, width))).join('-+-') + '-+';
    const lines = [separator];
    grid.forEach(row => {
        const line = row.concat(new Array(Math.max(0, colCount - row.length)).fill('')).map((value, index) => {
            const safeValue = String(value ?? '');
            const padding = Math.max(0, widths[index] - getDisplayWidth(safeValue));
            return safeValue + ' '.repeat(padding);
        });
        lines.push('| ' + line.join(' | ') + ' |');
        lines.push(separator);
    });
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
 * 隐藏多选菜单
 */
function hideTableSelectionMenu() {
    if (tableSelectionUi.menu) {
        tableSelectionUi.menu.classList.remove('is-open');
    }
}

/**
 * 隐藏多选操作按钮和菜单
 */
function hideTableSelectionActions() {
    hideTableSelectionMenu();
    if (tableSelectionUi.button) {
        tableSelectionUi.button.classList.remove('is-visible');
    }
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

    if (tableSelectionUi.container === container && tableSelectionUi.button && tableSelectionUi.menu) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-selection-actions';

    const button = document.createElement('button');
    button.className = 'table-selection-more-btn';
    button.type = 'button';
    button.title = L10N_TEXT.tableSelectionMore;
    button.innerHTML = '<i class="codicon codicon-more"></i>';

    const menu = document.createElement('div');
    menu.className = 'table-selection-menu';

    const asciiButton = document.createElement('button');
    asciiButton.type = 'button';
    asciiButton.className = 'table-selection-menu-item';
    asciiButton.textContent = L10N_TEXT.tableSelectionAscii;

    const tsvButton = document.createElement('button');
    tsvButton.type = 'button';
    tsvButton.className = 'table-selection-menu-item';
    tsvButton.textContent = L10N_TEXT.tableSelectionTsv;

    menu.appendChild(asciiButton);
    menu.appendChild(tsvButton);
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    container.appendChild(wrapper);

    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menu.classList.contains('is-open')) {
            menu.classList.remove('is-open');
        } else {
            menu.classList.add('is-open');
        }
    });

    asciiButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return;
        }
        const grid = buildSelectionGrid(selectedCells);
        await writeTextToClipboard(buildAsciiTableText(grid));
        hideTableSelectionMenu();
    });

    tsvButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const selectedCells = getSelectedCells();
        if (selectedCells.length < 2) {
            hideTableSelectionActions();
            return;
        }
        const grid = buildSelectionGrid(selectedCells);
        await writeTextToClipboard(buildTsvText(grid));
        hideTableSelectionMenu();
    });

    document.addEventListener('mousedown', (e) => {
        if (!wrapper.contains(e.target)) {
            hideTableSelectionMenu();
        }
    });

    tableSelectionUi = {
        container,
        button,
        menu
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
    if (!tableSelectionUi.button || !tableSelectionUi.container) {
        return;
    }

    const selectedCells = getSelectedCells();
    if (selectedCells.length < 2) {
        hideTableSelectionActions();
        return;
    }

    const bounds = selectedCells.reduce((acc, cell) => {
        const rect = cell.getBoundingClientRect();
        acc.left = Math.min(acc.left, rect.left);
        acc.top = Math.min(acc.top, rect.top);
        acc.right = Math.max(acc.right, rect.right);
        return acc;
    }, {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY
    });

    const containerRect = tableSelectionUi.container.getBoundingClientRect();
    const button = tableSelectionUi.button;
    button.classList.add('is-visible');
    const buttonWidth = button.offsetWidth || 24;
    const buttonHeight = button.offsetHeight || 24;

    let left = bounds.right - containerRect.left + tableSelectionUi.container.scrollLeft - buttonWidth;
    let top = bounds.top - containerRect.top + tableSelectionUi.container.scrollTop - buttonHeight - TABLE_SELECTION_ACTION_MARGIN_PX;
    left = Math.max(TABLE_SELECTION_ACTION_MARGIN_PX, left);
    top = Math.max(TABLE_SELECTION_ACTION_MARGIN_PX, top);
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;

    if (tableSelectionUi.menu.classList.contains('is-open')) {
        tableSelectionUi.menu.style.left = `${left + buttonWidth + TABLE_SELECTION_ACTION_MARGIN_PX}px`;
        tableSelectionUi.menu.style.top = `${top}px`;
    } else {
        tableSelectionUi.menu.style.left = `${left + buttonWidth + TABLE_SELECTION_ACTION_MARGIN_PX}px`;
        tableSelectionUi.menu.style.top = `${top}px`;
    }
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
});

// 向公共注册中心登记：仅在 CSV / TSV 文件类型时激活
PreviewCommon.registerDomainInit(['csv', 'tsv'], 'table', function() {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

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
    highlightTableRangeFunc: highlightTableRangeFunc,
    scrollToLine: scrollToLine,
    reportVisibleLine: reportVisibleLine
};
})();
