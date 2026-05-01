// 数据树交互模块
// 负责 JSON/YAML/TOML/XML 数据树的展开 / 折叠、键名点击导航、编辑行高亮定位

(function() {

let currentDataTreeFileType = null;

/**
 * 展开树形视图到指定行
 * 处理目标行相关逻辑并返回结果
 * @param targetLine - 目标行号
 */
function expandToLine(targetLine) {
    const normalizedTargetLine = normalizeLineValue(targetLine);
    if (normalizedTargetLine === null) {
        return;
    }

    // 查找所有带 data-line 的 key 元素
    const keys = document.querySelectorAll('.data-tree .tree-key[data-line]');
    if (keys.length === 0) {
        return;
    }

    // 找到 data-line <= targetLine 且最接近的元素（即目标行所属的 key）
    let best = null;
    let bestLine = -1;
    keys.forEach(key => {
        const line = parseInt(key.getAttribute('data-line'), 10);
        if (!isNaN(line) && line <= normalizedTargetLine && line > bestLine) {
            bestLine = line;
            best = key;
        }
    });

    // 如果没有找到 <= 的，取最近的
    if (!best) {
        let closestDist = Infinity;
        keys.forEach(key => {
            const line = parseInt(key.getAttribute('data-line'), 10);
            if (!isNaN(line)) {
                const dist = Math.abs(line - normalizedTargetLine);
                if (dist < closestDist) {
                    closestDist = dist;
                    best = key;
                }
            }
        });
    }

    if (!best) {
        return;
    }

    // 展开所有祖先 details 元素
    let el = best.closest('.tree-item');
    while (el) {
        if (el.tagName === 'DETAILS') {
            el.setAttribute('open', '');
        }
        // 如果当前 tree-item 包含 details（即该 key 下有子节点），也展开
        const details = el.querySelector(':scope > details');
        if (details) {
            details.setAttribute('open', '');
        }
        el = el.parentElement;
    }

    // 滚动到目标节点
    best.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * 清理树高亮状态，避免脏数据残留
 */
function clearTreeHighlights() {
    const highlightedItems = document.querySelectorAll('.data-tree .tree-item.is-highlight');
    highlightedItems.forEach(item => item.classList.remove('is-highlight'));
}

/**
 * 收集最近树节点元素集合并聚合返回
 * @param elements - 待聚合的 DOM 元素集合
 * @returns 返回去重后的最近树节点集合
 */
function collectNearestTreeItems(elements) {
    const uniqueItems = new Set();
    elements.forEach(element => {
        const item = element.closest('.tree-item');
        if (item) {
            uniqueItems.add(item);
        }
    });
    return Array.from(uniqueItems);
}

/**
 * 读取树节点上用于行号映射的锚点元素
 * @param treeItem - 树节点元素
 * @returns 返回锚点元素
 */
function getTreeItemAnchorElement(treeItem) {
    if (!treeItem || typeof treeItem.querySelector !== 'function') {
        return null;
    }

    return treeItem.querySelector(':scope > .tree-key[data-line], :scope > .tree-index[data-line], :scope > details > summary > .tree-key[data-line], :scope > details > summary > .tree-index[data-line]');
}

/**
 * 读取树节点行号用于同行冲突处理
 * @param treeItem - 树节点元素
 * @returns 返回行号
 */
function getTreeItemLine(treeItem) {
    const anchor = getTreeItemAnchorElement(treeItem);
    if (!anchor || typeof anchor.getAttribute !== 'function') {
        return null;
    }

    const line = parseInt(anchor.getAttribute('data-line'), 10);
    return isNaN(line) ? null : line;
}

/**
 * 判断树节点是否为数组索引节点
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isTreeIndexTreeItem(treeItem) {
    const anchor = getTreeItemAnchorElement(treeItem);
    if (!anchor || !anchor.classList || typeof anchor.classList.contains !== 'function') {
        return false;
    }
    return anchor.classList.contains('tree-index');
}

/**
 * 判断树节点是否为 XML 属性键
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isXmlAttributeTreeItem(treeItem) {
    const anchor = getTreeItemAnchorElement(treeItem);
    if (!anchor) {
        return false;
    }

    if (anchor.classList && typeof anchor.classList.contains === 'function' && !anchor.classList.contains('tree-key')) {
        return false;
    }

    const label = (anchor.textContent || '').trim();
    return label.startsWith('@');
}

/**
 * 判断树节点是否为 XML 文本类键
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isXmlTextLikeTreeItem(treeItem) {
    const anchor = getTreeItemAnchorElement(treeItem);
    if (!anchor) {
        return false;
    }

    if (anchor.classList && typeof anchor.classList.contains === 'function' && !anchor.classList.contains('tree-key')) {
        return false;
    }

    const label = (anchor.textContent || '').trim().toUpperCase();
    return label === '#TEXT' || label === '#CDATA';
}

/**
 * 读取树节点标签文本并返回结果
 * @param treeItem - 树节点元素
 * @returns 返回树节点标签文本
 */
function getTreeItemLabel(treeItem) {
    const anchor = getTreeItemAnchorElement(treeItem);
    if (!anchor || typeof anchor.textContent !== 'string') {
        return '';
    }

    return anchor.textContent.trim();
}

/**
 * 判断树节点是否属于 XML 特殊键
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isXmlSpecialTreeItem(treeItem) {
    const label = getTreeItemLabel(treeItem);
    return label.startsWith('@') || label.startsWith('#') || label.startsWith('!') || label.startsWith('?');
}

/**
 * 读取树节点父级元素并返回结果
 * @param treeItem - 树节点元素
 * @returns 返回父级树节点
 */
function getParentTreeItem(treeItem) {
    if (!treeItem || !treeItem.parentElement || typeof treeItem.parentElement.closest !== 'function') {
        return null;
    }

    return treeItem.parentElement.closest('.tree-item');
}

/**
 * 读取树节点深度用于冲突判定
 * @param treeItem - 树节点元素
 * @returns 返回树节点深度
 */
function getTreeItemDepth(treeItem) {
    let depth = 0;
    let current = getParentTreeItem(treeItem);
    while (current) {
        depth += 1;
        current = getParentTreeItem(current);
    }

    return depth;
}

/**
 * 判断树节点祖先关系
 * @param ancestor - 祖先节点
 * @param treeItem - 目标节点
 * @returns 返回布尔判断结果
 */
function isAncestorTreeItem(ancestor, treeItem) {
    let current = treeItem;
    while (current) {
        if (current === ancestor) {
            return true;
        }
        current = getParentTreeItem(current);
    }

    return false;
}

/**
 * 查找命中集合中的共同父元素键
 * @param lineItems - 同一行命中的树节点集合
 * @returns 返回共同父元素键
 */
function findCommonParentTreeItemInMatches(lineItems) {
    let best = null;
    let bestDepth = -1;

    lineItems.forEach(candidate => {
        if (isTreeIndexTreeItem(candidate)) {
            return;
        }

        const coversAll = lineItems.every(item => isAncestorTreeItem(candidate, item));
        if (!coversAll) {
            return;
        }

        const depth = getTreeItemDepth(candidate);
        if (depth > bestDepth) {
            best = candidate;
            bestDepth = depth;
        }
    });

    return best;
}

/**
 * 查找命中集合中最优共同父元素
 * @param lineItems - 同一行命中的树节点集合
 * @param options - 筛选选项
 * @returns 返回最优共同父元素
 */
function findBestCoveredTreeItem(lineItems, options = {}) {
    const {
        onlyIndex = false,
        excludeIndex = false,
    } = options;

    let best = null;
    let bestDepth = -1;
    let bestCoverage = -1;

    lineItems.forEach(candidate => {
        const isIndex = isTreeIndexTreeItem(candidate);
        if (onlyIndex && !isIndex) {
            return;
        }

        if (excludeIndex && isIndex) {
            return;
        }

        const coverage = lineItems.filter(item => isAncestorTreeItem(candidate, item)).length;
        if (coverage < 2) {
            return;
        }

        const depth = getTreeItemDepth(candidate);
        if (depth > bestDepth || (depth === bestDepth && coverage > bestCoverage)) {
            best = candidate;
            bestDepth = depth;
            bestCoverage = coverage;
        }
    });

    return best;
}

/**
 * 查找命中集合的最近共同外层节点
 * @param lineItems - 同一行命中的树节点集合
 * @returns 返回共同外层树节点
 */
function findNearestCommonAncestorTreeItem(lineItems) {
    if (lineItems.length === 0) {
        return null;
    }

    const ancestorChains = lineItems.map(item => {
        const chain = [];
        let current = item;
        while (current) {
            chain.push(current);
            current = getParentTreeItem(current);
        }
        return chain;
    });

    for (const candidate of ancestorChains[0]) {
        if (ancestorChains.every(chain => chain.includes(candidate))) {
            return candidate;
        }
    }

    return null;
}

/**
 * 查找命中集合中的最优成对共同外层
 * @param lineItems - 同一行命中的树节点集合
 * @returns 返回最优共同外层
 */
function findBestPairCommonAncestorTreeItem(lineItems) {
    let best = null;
    let bestDepth = -1;

    for (let i = 0; i < lineItems.length; i++) {
        for (let j = i + 1; j < lineItems.length; j++) {
            const pairAncestor = findNearestCommonAncestorTreeItem([lineItems[i], lineItems[j]]);
            if (!pairAncestor) {
                continue;
            }

            const depth = getTreeItemDepth(pairAncestor);
            if (depth > bestDepth) {
                best = pairAncestor;
                bestDepth = depth;
            }
        }
    }

    return best;
}

/**
 * 选择命中集合中最深层树节点
 * @param lineItems - 同一行命中的树节点集合
 * @returns 返回最深层树节点集合
 */
function pickDeepestTreeItems(lineItems) {
    return lineItems.filter(item => !lineItems.some(other => other !== item && isAncestorTreeItem(item, other)));
}

/**
 * 解析同一行命中集合的最终高亮节点
 * @param lineItems - 同一行命中的树节点集合
 * @returns 返回最终高亮节点集合
 */
function resolveLineHighlightTreeItems(lineItems) {
    if (lineItems.length <= 1) {
        return [...lineItems];
    }

    const isXmlFileType = currentDataTreeFileType === 'xml';
    if (!isXmlFileType) {
        return pickDeepestTreeItems(lineItems);
    }

    const hasXmlSpecialKey = lineItems.some(item => isXmlSpecialTreeItem(item));
    if (!hasXmlSpecialKey) {
        return pickDeepestTreeItems(lineItems);
    }

    const bestIndexParent = findBestCoveredTreeItem(lineItems, { onlyIndex: true });
    if (bestIndexParent) {
        return [bestIndexParent];
    }

    const commonParent = findBestCoveredTreeItem(lineItems, { excludeIndex: true }) || findCommonParentTreeItemInMatches(lineItems);
    if (commonParent) {
        return [commonParent];
    }

    const commonAncestor = findBestPairCommonAncestorTreeItem(lineItems) || findNearestCommonAncestorTreeItem(lineItems);
    if (commonAncestor) {
        return [commonAncestor];
    }

    const deepest = pickDeepestTreeItems(lineItems);
    if (deepest.length > 0) {
        return [deepest[0]];
    }

    return [];
}

/**
 * 过滤同行重复命中的树节点避免父子联动高亮
 * @param matchedItems - 命中的树节点集合
 * @returns 返回过滤后的树节点集合
 */
function filterDuplicateLineTreeItems(matchedItems) {
    const groupedByLine = new Map();
    const noLineItems = [];

    matchedItems.forEach(item => {
        const line = getTreeItemLine(item);
        if (line === null || line === undefined) {
            noLineItems.push(item);
            return;
        }

        const existing = groupedByLine.get(line) || [];
        existing.push(item);
        groupedByLine.set(line, existing);
    });

    const resolved = new Set();
    groupedByLine.forEach(lineItems => {
        resolveLineHighlightTreeItems(lineItems).forEach(item => resolved.add(item));
    });

    pickDeepestTreeItems(noLineItems).forEach(item => resolved.add(item));

    return Array.from(resolved);
}

/**
 * 归一化行范围以统一后续处理
 * @param startLine - 起始行号
 * @param endLine - 结束行号
 * @returns 返回归一化后的行范围对象
 */
function normalizeLineRange(startLine, endLine) {
    if (startLine === null || startLine === undefined) {
        return null;
    }

    const start = parseInt(startLine, 10);
    const end = endLine === null || endLine === undefined ? start : parseInt(endLine, 10);
    if (isNaN(start) || isNaN(end)) {
        return null;
    }

    return {
        from: Math.min(start, end),
        to: Math.max(start, end)
    };
}

/**
 * 处理树范围相关逻辑并返回结果
 * @param startLine - 起始行号
 * @param endLine - 结束行号
 */
function highlightTreeRange(startLine, endLine) {
    clearTreeHighlights();

    const range = normalizeLineRange(startLine, endLine);
    if (!range) {
        return;
    }

    const anchors = Array.from(document.querySelectorAll('.data-tree .tree-key[data-line], .data-tree .tree-index[data-line]'));
    if (anchors.length === 0) {
        return;
    }

    const inRange = [];
    for (const anchor of anchors) {
        const line = parseInt(anchor.getAttribute('data-line'), 10);
        if (!isNaN(line) && line >= range.from && line <= range.to) {
            inRange.push(anchor);
        }
    }

    if (inRange.length > 0) {
        const matchedItems = filterDuplicateLineTreeItems(collectNearestTreeItems(inRange));
        matchedItems.forEach(item => item.classList.add('is-highlight'));
        return;
    }

    let closestKey = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
        const line = parseInt(anchor.getAttribute('data-line'), 10);
        if (isNaN(line)) {
            continue;
        }
        const dist = line < range.from ? range.from - line : line - range.to;
        if (dist < closestDist) {
            closestDist = dist;
            closestKey = anchor;
        }
    }

    if (closestKey) {
        const closestItem = closestKey.closest('.tree-item');
        if (closestItem) {
            closestItem.classList.add('is-highlight');
        }
    }
}

/**
 * 绑定树形视图 key 点击事件
 * 绑定数据树键名点击事件并回传导航行号
 */
function bindTreeKeyClicks() {
    const keys = document.querySelectorAll('.data-tree .tree-key[data-line]');
    keys.forEach(key => {
        key.addEventListener('click', (e) => {
            if (typeof PreviewCommon !== 'undefined' && PreviewCommon.focusPreviewContent) {
                PreviewCommon.focusPreviewContent();
            }
            if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.isCommentTooltipInteractionLocked()) {
                PreviewCommentTooltip.stopEvent(e);
                return;
            }
            e.stopPropagation();
            e.preventDefault();
            const line = parseInt(key.getAttribute('data-line'), 10);
            if (!isNaN(line) && line >= 0) {
                VSCODE_API.postMessage({
                    type: 'navigateToLine',
                    line: line
                });
            }
        });
    });
}

/**
 * 展开所有树形节点
 * 处理全部节点相关逻辑并返回结果
 */
function expandAllNodes() {
    const details = document.querySelectorAll('.data-tree details');
    details.forEach(d => d.setAttribute('open', ''));
}

/**
 * 折叠所有树形节点
 * 处理全部节点相关逻辑并返回结果
 */
function collapseAllNodes() {
    const details = document.querySelectorAll('.data-tree details');
    details.forEach(d => d.removeAttribute('open'));
}

// 向公共注册中心登记：仅在数据树类型（JSON/YAML/TOML/XML）文件时激活
PreviewCommon.registerDomainInit(
    ['json', 'yaml', 'toml', 'xml'],
    'datatree',
    function(fileType, messageData) {
        currentDataTreeFileType = fileType;
        const dataTreeRoot = document.querySelector('.data-tree');
        if (dataTreeRoot) {
            dataTreeRoot.addEventListener('mousedown', () => {
                if (typeof PreviewCommon !== 'undefined' && PreviewCommon.focusPreviewContent) {
                    PreviewCommon.focusPreviewContent();
                }
            });
        }
        // 首先初始化注释提示框（依赖 preview-comment-tooltip.js）
        if (typeof PreviewCommentTooltip !== 'undefined') {
            PreviewCommentTooltip.bindCommentTooltipInteractionGuard();
            PreviewCommentTooltip.bindCommentTooltips();
        }
        // 绑定树形键名点击导航事件
        bindTreeKeyClicks();
        // 高亮编辑器当前选中的行范围
        highlightTreeRange(messageData.selectionStartLine, messageData.selectionEndLine);

        // 编辑时自动展开到被修改的行
        var editedLine = (function(val) {
            if (val === null || val === undefined) { return null; }
            var parsed = Number.parseInt(String(val), 10);
            return Number.isNaN(parsed) ? null : parsed;
        })(messageData.editedLine);
        if (editedLine !== null) {
            expandToLine(editedLine);
        }
    }
);

// 暴露公共方法
window.PreviewDatatree = {
    expandToLine: expandToLine,
    highlightTreeRange: highlightTreeRange,
    bindTreeKeyClicks: bindTreeKeyClicks,
    expandAllNodes: expandAllNodes,
    collapseAllNodes: collapseAllNodes
};
})();
