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
        }
    });

    window.addEventListener('mouseup', () => {
        if (tableDragState.isDragging) {
            tableDragState.isDragging = false;
            applyTableSelectionToEditor();
        }
    });
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
    const selectedCells = Array.from(document.querySelectorAll('.tabular-table .selected'));
    if (selectedCells.length === 0) {
        return;
    }
    e.preventDefault();

    // 第一步：计算选中区域的矩形边界（最小行号、最大行号、最小列号、最大列号）
    let minRow = Infinity, maxRow = -Infinity;
    let minCol = Infinity, maxCol = -Infinity;

    selectedCells.forEach(cell => {
        const r = cell.parentElement.rowIndex;
        const c = cell.cellIndex;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
    });

    // 第二步：按边界尺寸构建二维网格，空字符串填充所有单元格
    // 未被选中的单元格（如框选范围内的空单元格）保留为空位，生成连续 \t
    const rowCount = maxRow - minRow + 1;
    const colCount = maxCol - minCol + 1;
    const grid = Array.from({ length: rowCount }, () => Array(colCount).fill(''));

    // 第三步：遍历选中单元格，将内容填入网格对应位置
    selectedCells.forEach(cell => {
        const r = cell.parentElement.rowIndex - minRow;
        const c = cell.cellIndex - minCol;

        // 带有 table-empty-cell 标记的单元格视为空单元格
        if (cell.querySelector('.table-empty-cell')) {
            grid[r][c] = '';
        } else {
            const raw = cell.textContent || '';
            // 将单元格内的 \t 和 \n 替换为空格，避免破坏 TSV 的行列结构
            grid[r][c] = raw.replace(/\t/g, ' ').replace(/\n/g, ' ');
        }
    });

    // 第四步：生成纯文本 TSV 字符串
    // 同行相邻单元格用 \t 分隔（连续 \t 表示存在空单元格），行间用 \r\n 分隔
    const tsvText = grid.map(row => row.join('\t')).join('\r\n');

    // 第五步：生成 HTML 表格片段，供 Excel 等富文本编辑器粘贴时还原表格结构
    let htmlTable = '<table>';
    grid.forEach(row => {
        htmlTable += '<tr>';
        row.forEach(val => {
            const escaped = val
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            htmlTable += '<td>' + escaped + '</td>';
        });
        htmlTable += '</tr>';
    });
    htmlTable += '</table>';

    // 第六步：通过 clipboardData 同时写入 text/plain 和 text/html 两种格式
    e.clipboardData.setData('text/plain', tsvText);
    e.clipboardData.setData('text/html', htmlTable);
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
});

/**
 * 将表格滚动到指定行
 * @param line - 目标行号
 */
function scrollToLine(line) {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

    const cells = table.querySelectorAll('th[data-start-line], td[data-start-line]');
    let best = null;
    let bestLine = -1;

    cells.forEach(cell => {
        const l = parseInt(cell.getAttribute('data-start-line'), 10);
        if (!isNaN(l) && l <= line && l > bestLine) {
            bestLine = l;
            best = cell;
        }
    });

    if (best) {
        best.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
}

/**
 * 报告当前可见表格行，回传给扩展端用于编辑定位
 */
function reportVisibleLine() {
    const table = document.querySelector('.tabular-table');
    if (!table) { return; }

    const cells = table.querySelectorAll('th[data-start-line], td[data-start-line]');
    let bestCell = null;
    let bestDistance = Infinity;

    cells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const distance = Math.abs(rect.top);
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
