// 注释提示框交互模块
// 为数据树（JSON/YAML/TOML/XML）中的注释图标提供 hover / 点击 / 聚焦提示框，
// 包含提示框的显示、隐藏、定位、交互守卫等完整交互逻辑

(function() {

// 注释提示框相关全局状态
let commentTooltip = null;
let commentTooltipTarget = null;
let commentTooltipHideTimer = null;
let commentTooltipHovering = false;
let commentTooltipFocusLocked = false;
let commentTooltipInteractionGuardBound = false;
let commentTooltipInteractionDismissedAt = 0;

/**
 * 按缩放比例同步注释提示框尺寸
 */
function applyCommentTooltipZoom() {
    if (!commentTooltip) {
        return;
    }

    commentTooltip.style.zoom = String(getZoomScale());
}

/**
 * 处理注释提示框相关逻辑并返回结果
 * @returns 返回注释提示框元素
 */
function ensureCommentTooltip() {
    if (commentTooltip) {
        return commentTooltip;
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'tree-comment-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('tabindex', '0');

    tooltip.addEventListener('mouseenter', () => {
        commentTooltipHovering = true;
        clearCommentTooltipHideTimer();
    });
    tooltip.addEventListener('mousemove', positionCommentTooltip);
    tooltip.addEventListener('mouseleave', () => {
        commentTooltipHovering = false;
        if (commentTooltipFocusLocked) {
            return;
        }
        scheduleCommentTooltipHide();
    });
    tooltip.addEventListener('mousedown', () => {
        commentTooltipFocusLocked = true;
        updateCommentTooltipFocusClass();
        clearCommentTooltipHideTimer();
    });
    tooltip.addEventListener('focus', () => {
        commentTooltipFocusLocked = true;
        updateCommentTooltipFocusClass();
        clearCommentTooltipHideTimer();
    });
    tooltip.addEventListener('blur', () => {
        commentTooltipFocusLocked = false;
        updateCommentTooltipFocusClass();
        hideCommentTooltip(true);
    });

    document.body.appendChild(tooltip);
    commentTooltip = tooltip;
    return tooltip;
}

/**
 * 判断元素位于注释提示框是否成立
 * @param element - 待判断的 DOM 节点
 * @returns 返回布尔判断结果
 */
function isElementWithinCommentTooltip(element) {
    if (!commentTooltip || !(element instanceof Node)) {
        return false;
    }
    return element === commentTooltip || commentTooltip.contains(element);
}

/**
 * 判断注释提示框交互锁定是否成立
 * @returns 返回布尔判断结果
 */
function isCommentTooltipInteractionLocked() {
    return Boolean(
        commentTooltipFocusLocked
        && commentTooltip
        && commentTooltip.classList.contains('is-visible')
    );
}

/**
 * 判断锁定到不同注释目标是否成立
 * @param target - 目标 DOM 节点
 * @returns 返回布尔判断结果
 */
function isLockedToDifferentCommentTarget(target) {
    return Boolean(
        isCommentTooltipInteractionLocked()
        && commentTooltipTarget
        && commentTooltipTarget !== target
    );
}

/**
 * 处理事件相关逻辑并返回结果
 * @param event - 待拦截的事件对象
 */
function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
    }
}

/**
 * 绑定注释提示框交互保护以建立响应逻辑
 */
function bindCommentTooltipInteractionGuard() {
    if (commentTooltipInteractionGuardBound) {
        return;
    }

    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    const onGuardedInteraction = (event) => {
        if (event.type === 'click' && commentTooltipInteractionDismissedAt > 0) {
            const elapsed = performance.now() - commentTooltipInteractionDismissedAt;
            commentTooltipInteractionDismissedAt = 0;
            if (elapsed <= COMMENT_TOOLTIP_CLICK_BLOCK_WINDOW_MS) {
                stopEvent(event);
                return;
            }
        }

        if (!isCommentTooltipInteractionLocked()) {
            return;
        }
        if (isElementWithinCommentTooltip(event.target)) {
            return;
        }

        hideCommentTooltip(true);
        if (event.type === 'pointerdown') {
            commentTooltipInteractionDismissedAt = performance.now();
        }
        stopEvent(event);
    };

    content.addEventListener('pointerdown', onGuardedInteraction, true);
    content.addEventListener('click', onGuardedInteraction, true);
    content.addEventListener('contextmenu', onGuardedInteraction, true);
    commentTooltipInteractionGuardBound = true;
}

/**
 * 解析注释载荷并返回结构化结果
 * @param target - 目标 DOM 节点
 * @returns 返回结构化结果
 */
function parseCommentPayload(target) {
    const raw = target.getAttribute('data-comments');
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(item => {
            return item
                && typeof item === 'object'
                && typeof item.marker === 'string'
                && typeof item.text === 'string'
                && item.text.length > 0;
        });
    } catch (_error) {
        return [];
    }
}

/**
 * 渲染注释提示框元素集合并返回可展示内容
 * @param tooltip - 注释提示框元素
 * @param comments - 注释项集合
 */
function renderCommentTooltipItems(tooltip, comments) {
    tooltip.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'tree-comment-tooltip-list';

    comments.forEach(comment => {
        const row = document.createElement('div');
        row.className = 'tree-comment-tooltip-item';

        const marker = document.createElement('span');
        marker.className = 'tree-comment-tooltip-marker';
        marker.textContent = comment.marker;

        const body = document.createElement('span');
        body.className = 'tree-comment-tooltip-body';
        body.textContent = comment.text;

        row.appendChild(marker);
        row.appendChild(body);
        list.appendChild(row);
    });

    tooltip.appendChild(list);
}

/**
 * 显示注释提示框
 * @param target - 目标 DOM 节点
 */
function showCommentTooltip(target) {
    const comments = parseCommentPayload(target);
    if (comments.length === 0) {
        return;
    }

    clearCommentTooltipHideTimer();
    const tooltip = ensureCommentTooltip();
    renderCommentTooltipItems(tooltip, comments);
    commentTooltipTarget = target;
    applyCommentTooltipZoom();
    tooltip.classList.add('is-visible');
    updateCommentTooltipFocusClass();
    positionCommentTooltip();
}

/**
 * 清理注释提示框隐藏计时器，避免脏数据残留
 */
function clearCommentTooltipHideTimer() {
    if (!commentTooltipHideTimer) {
        return;
    }
    clearTimeout(commentTooltipHideTimer);
    commentTooltipHideTimer = null;
}

/**
 * 延迟隐藏注释提示框，避免光标抖动导致闪烁
 * @param delayMs - 隐藏延迟时间（毫秒）
 */
function scheduleCommentTooltipHide(delayMs = COMMENT_TOOLTIP_HIDE_DELAY_MS) {
    clearCommentTooltipHideTimer();
    commentTooltipHideTimer = setTimeout(() => {
        commentTooltipHideTimer = null;
        if (commentTooltipFocusLocked || commentTooltipHovering) {
            return;
        }
        hideCommentTooltip(true);
    }, delayMs);
}

/**
 * 更新注释提示框焦点样式并同步相关结果
 */
function updateCommentTooltipFocusClass() {
    if (!commentTooltip) {
        clearCommentTooltipTargetFocusClass();
        return;
    }
    commentTooltip.classList.toggle('is-focused', commentTooltipFocusLocked);
    updateCommentTooltipTargetFocusClass();
}

/**
 * 清理注释提示框目标焦点样式，避免脏数据残留
 */
function clearCommentTooltipTargetFocusClass() {
    const focusedIcons = document.querySelectorAll('.data-tree .tree-comment-icon.is-tooltip-focused');
    focusedIcons.forEach(icon => icon.classList.remove('is-tooltip-focused'));
}

/**
 * 更新注释提示框目标焦点样式并同步相关结果
 */
function updateCommentTooltipTargetFocusClass() {
    clearCommentTooltipTargetFocusClass();

    if (!commentTooltip || !commentTooltipTarget) {
        return;
    }

    const tooltipIsFocused = document.activeElement === commentTooltip;
    const shouldHighlightTarget = commentTooltip.classList.contains('is-visible')
        && commentTooltipFocusLocked
        && tooltipIsFocused;

    if (shouldHighlightTarget) {
        commentTooltipTarget.classList.add('is-tooltip-focused');
    }
}

/**
 * 隐藏注释提示框
 * @param force - 是否强制隐藏提示框
 */
function hideCommentTooltip(force = false) {
    if (!commentTooltip) {
        return;
    }
    if (!force && commentTooltipFocusLocked) {
        return;
    }

    if (force) {
        commentTooltipHovering = false;
        commentTooltipFocusLocked = false;
    }

    clearCommentTooltipHideTimer();
    clearCommentTooltipTargetFocusClass();
    commentTooltip.classList.remove('is-visible');
    commentTooltip.classList.remove('is-focused');
    commentTooltipTarget = null;
}

/**
 * 处理注释提示框相关逻辑并返回结果
 */
function positionCommentTooltip() {
    if (!commentTooltip || !commentTooltipTarget || !commentTooltip.classList.contains('is-visible')) {
        return;
    }

    const targetRect = commentTooltipTarget.getBoundingClientRect();
    const tooltipRect = commentTooltip.getBoundingClientRect();
    const edgePadding = 8;
    const gap = 8;

    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(edgePadding, Math.min(left, window.innerWidth - tooltipRect.width - edgePadding));

    let top = targetRect.top - tooltipRect.height - gap;
    if (top < edgePadding) {
        top = targetRect.bottom + gap;
    }
    top = Math.max(edgePadding, Math.min(top, window.innerHeight - tooltipRect.height - edgePadding));

    const zoomScale = getZoomScale();
    commentTooltip.style.left = `${left / zoomScale}px`;
    commentTooltip.style.top = `${top / zoomScale}px`;
}

/**
 * 绑定注释提示框以建立响应逻辑
 */
function bindCommentTooltips() {
    const icons = document.querySelectorAll('.data-tree .tree-comment-icon[data-comments]');
    icons.forEach(icon => {
        icon.addEventListener('pointerdown', (event) => {
            stopEvent(event);
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            showCommentTooltip(icon);
        });
        icon.addEventListener('click', (event) => {
            stopEvent(event);
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            showCommentTooltip(icon);
            const tooltip = ensureCommentTooltip();
            tooltip.focus({ preventScroll: true });
        });
        icon.addEventListener('mouseenter', () => {
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            commentTooltipHovering = true;
            showCommentTooltip(icon);
        });
        icon.addEventListener('mousemove', () => {
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            commentTooltipHovering = true;
            positionCommentTooltip();
        });
        icon.addEventListener('mouseleave', (event) => {
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            if (isElementWithinCommentTooltip(event.relatedTarget)) {
                commentTooltipHovering = true;
                clearCommentTooltipHideTimer();
                return;
            }
            commentTooltipHovering = false;
            if (commentTooltipFocusLocked) {
                return;
            }
            scheduleCommentTooltipHide();
        });
        icon.addEventListener('focus', () => {
            if (isLockedToDifferentCommentTarget(icon)) {
                return;
            }
            commentTooltipFocusLocked = true;
            showCommentTooltip(icon);
        });
        icon.addEventListener('blur', (event) => {
            if (isElementWithinCommentTooltip(event.relatedTarget)) {
                commentTooltipFocusLocked = true;
                updateCommentTooltipFocusClass();
                clearCommentTooltipHideTimer();
                return;
            }
            commentTooltipFocusLocked = false;
            updateCommentTooltipFocusClass();
            hideCommentTooltip(true);
        });
    });
}

// 在 window / document 上注册注释提示框位置更新事件监听
// 监听窗口尺寸变化，重新定位注释提示框
window.addEventListener('resize', positionCommentTooltip);
// 监听文档滚动事件，重新定位注释提示框（捕获阶段以确保优先响应）
document.addEventListener('scroll', positionCommentTooltip, true);

// 暴露公共方法
window.PreviewCommentTooltip = {
    ensureCommentTooltip: ensureCommentTooltip,
    hideCommentTooltip: hideCommentTooltip,
    showCommentTooltip: showCommentTooltip,
    positionCommentTooltip: positionCommentTooltip,
    bindCommentTooltips: bindCommentTooltips,
    bindCommentTooltipInteractionGuard: bindCommentTooltipInteractionGuard,
    applyCommentTooltipZoom: applyCommentTooltipZoom,
    isCommentTooltipInteractionLocked: isCommentTooltipInteractionLocked,
    isLockedToDifferentCommentTarget: isLockedToDifferentCommentTarget,
    stopEvent: stopEvent,
    scheduleCommentTooltipHide: scheduleCommentTooltipHide,
    clearCommentTooltipHideTimer: clearCommentTooltipHideTimer
};
})();
