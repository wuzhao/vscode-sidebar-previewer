// 数据树交互模块
// 负责 JSON/YAML/TOML/XML 数据树的展开 / 折叠、键名点击导航、编辑行高亮定位

(function() {

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
 * 读取树节点上用于行号映射的键元素
 * @param treeItem - 树节点元素
 * @returns 返回键元素
 */
function getTreeItemKeyElement(treeItem) {
    if (!treeItem || typeof treeItem.querySelector !== 'function') {
        return null;
    }

    return treeItem.querySelector(':scope > .tree-key[data-line], :scope > details > summary > .tree-key[data-line]');
}

/**
 * 读取树节点行号用于同行冲突处理
 * @param treeItem - 树节点元素
 * @returns 返回行号
 */
function getTreeItemLine(treeItem) {
    const key = getTreeItemKeyElement(treeItem);
    if (!key || typeof key.getAttribute !== 'function') {
        return null;
    }

    const line = parseInt(key.getAttribute('data-line'), 10);
    return isNaN(line) ? null : line;
}

/**
 * 判断树节点是否为 XML 属性键
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isXmlAttributeTreeItem(treeItem) {
    const key = getTreeItemKeyElement(treeItem);
    if (!key) {
        return false;
    }

    const label = (key.textContent || '').trim();
    return label.startsWith('@');
}

/**
 * 判断树节点是否为 XML 文本类键
 * @param treeItem - 树节点元素
 * @returns 返回布尔判断结果
 */
function isXmlTextLikeTreeItem(treeItem) {
    const key = getTreeItemKeyElement(treeItem);
    if (!key) {
        return false;
    }

    const label = (key.textContent || '').trim();
    return label === '#text' || label === '#cdata';
}

/**
 * 过滤同行重复命中的树节点避免父子联动高亮
 * @param matchedItems - 命中的树节点集合
 * @returns 返回过滤后的树节点集合
 */
function filterDuplicateLineTreeItems(matchedItems) {
    const nextItems = new Set(matchedItems);
    const lineMap = new Map();
    const lineHasTextLike = new Map();

    matchedItems.forEach(item => {
        const line = getTreeItemLine(item);
        lineMap.set(item, line);

        if (line === null || line === undefined) {
            return;
        }

        const hasTextLike = lineHasTextLike.get(line) === true;
        lineHasTextLike.set(line, hasTextLike || isXmlTextLikeTreeItem(item));
    });

    // XML 属性键与父节点同行时只保留父节点高亮
    for (const item of Array.from(nextItems)) {
        if (!isXmlAttributeTreeItem(item)) {
            continue;
        }

        const line = lineMap.get(item);
        if (line === null || line === undefined) {
            continue;
        }

        // 同行存在 #text / #cdata 时保留属性节点高亮，便于观察同一行完整语义
        if (lineHasTextLike.get(line) === true) {
            continue;
        }

        let parent = item.parentElement ? item.parentElement.closest('.tree-item') : null;
        while (parent) {
            if (nextItems.has(parent) && lineMap.get(parent) === line) {
                nextItems.delete(item);
                break;
            }

            parent = parent.parentElement ? parent.parentElement.closest('.tree-item') : null;
        }
    }

    // 非属性节点同行命中时只保留最深层节点
    for (const item of Array.from(nextItems)) {
        const line = lineMap.get(item);
        if (line === null || line === undefined) {
            continue;
        }

        // 同行存在 #text / #cdata 时不做最深层裁剪，保留元素 + 属性 + 文本的联动高亮
        if (lineHasTextLike.get(line) === true) {
            continue;
        }

        for (const other of nextItems) {
            if (other === item) {
                continue;
            }
            if (lineMap.get(other) !== line) {
                continue;
            }
            if (!item.contains(other)) {
                continue;
            }

            nextItems.delete(item);
            break;
        }
    }

    return Array.from(nextItems);
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

    const keys = Array.from(document.querySelectorAll('.data-tree .tree-key[data-line]'));
    if (keys.length === 0) {
        return;
    }

    const inRange = [];
    for (const key of keys) {
        const line = parseInt(key.getAttribute('data-line'), 10);
        if (!isNaN(line) && line >= range.from && line <= range.to) {
            inRange.push(key);
        }
    }

    if (inRange.length > 0) {
        const matchedItems = filterDuplicateLineTreeItems(collectNearestTreeItems(inRange));
        matchedItems.forEach(item => item.classList.add('is-highlight'));
        return;
    }

    let closestKey = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const key of keys) {
        const line = parseInt(key.getAttribute('data-line'), 10);
        if (isNaN(line)) {
            continue;
        }
        const dist = line < range.from ? range.from - line : line - range.to;
        if (dist < closestDist) {
            closestDist = dist;
            closestKey = key;
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
