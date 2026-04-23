const vscode = acquireVsCodeApi();
const l10nSource = document.body ? document.body.dataset : {};
const l10n = {
    copySuccess: l10nSource.copySuccess || 'COPIED!',
    copyCode: l10nSource.copyCode || 'Copy',
    viewCode: l10nSource.viewCode || 'Code',
    viewPreview: l10nSource.viewPreview || 'Preview',
};
const VALID_MESSAGE_TYPES = new Set([
    'update',
    'loading',
    'scrollToHeading',
    'getVisibleHeading',
    'zoom',
    'expandAll',
    'collapseAll',
    'highlightDataTreeRange',
]);
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300, 400];
const MERMAID_ZOOM_MULTIPLIER = 2;
const MERMAID_RENDER_TIMEOUT_MS = 5000;
const COMMENT_TOOLTIP_HIDE_DELAY_MS = 240;
const COMMENT_TOOLTIP_CLICK_BLOCK_WINDOW_MS = 260;
const mermaidDragState = {
    container: null,
    dragging: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
};

let currentHeadings = [];
let isScrollingFromEditor = false;
let zoomLevel = 100;
let wheelTimeout = null;
let currentFileType = null;
let commentTooltip = null;
let commentTooltipTarget = null;
let commentTooltipHideTimer = null;
let commentTooltipHovering = false;
let commentTooltipFocusLocked = false;
let commentTooltipInteractionGuardBound = false;
let commentTooltipInteractionDismissedAt = 0;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getErrorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return String(error || 'Unknown error');
}

window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !VALID_MESSAGE_TYPES.has(message.type)) {
        return;
    }

    switch (message.type) {
        case 'update':
            updateContent(message);
            break;
        case 'loading':
            showLoading();
            break;
        case 'scrollToHeading':
            scrollToHeading(message.headingId);
            break;
        case 'getVisibleHeading':
            reportVisibleHeading();
            break;
        case 'zoom':
            zoomLevel = message.level;
            applyZoom();
            break;
        case 'expandAll':
            expandAllNodes();
            break;
        case 'collapseAll':
            collapseAllNodes();
            break;
        case 'highlightDataTreeRange':
            highlightTreeRange(message.startLine, message.endLine);
            break;
    }
});

vscode.postMessage({ type: 'webviewReady' });

// 监听滚轮事件，支持 cmd/ctrl + 轮缩放
document.addEventListener('wheel', (e) => {
    // macOS 使用 metaKey (cmd)，Windows/Linux 使用 ctrlKey
    if (e.metaKey || e.ctrlKey) {
        e.preventDefault();

        // 节流控制，避免缩放过快
        if (wheelTimeout) {
            return;
        }

        wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
        }, 50);

        if (e.deltaY < 0) {
            // 向上滚动，放大
            const nextStep = ZOOM_STEPS.find(step => step > zoomLevel);
            if (nextStep !== undefined) {
                zoomLevel = nextStep;
                applyZoom();
                notifyZoomChange();
            }
        } else {
            // 向下滚动，缩小
            const reverseSteps = [...ZOOM_STEPS].reverse();
            const nextStep = reverseSteps.find(step => step < zoomLevel);
            if (nextStep !== undefined) {
                zoomLevel = nextStep;
                applyZoom();
                notifyZoomChange();
            }
        }
    }
}, { passive: false });

window.addEventListener('mousemove', onMermaidMouseMove);
window.addEventListener('mouseup', stopMermaidDragging);
window.addEventListener('blur', stopMermaidDragging);
window.addEventListener('resize', positionCommentTooltip);
document.addEventListener('scroll', positionCommentTooltip, true);

// 通知扩展缩放级别变化
function notifyZoomChange() {
    vscode.postMessage({
        type: 'zoomChange',
        level: zoomLevel
    });
}

function updateContent(data) {
    const content = document.getElementById('content');
    const previousScrollTop = content.scrollTop;
    hideCommentTooltip(true);
    teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    content.classList.remove('is-loading');
    
    // 如果后端传来 baseUri，则在 head 中设置 <base>，使相对路径（如 screenshots/xxx.png）能被解析为 webview 资源
    if (data.baseUri) {
        let base = document.querySelector('base');
        if (!base) {
            base = document.createElement('base');
            document.head.appendChild(base);
        }
        base.setAttribute('href', data.baseUri.endsWith('/') ? data.baseUri : data.baseUri + '/');
    }

    content.innerHTML = data.content;
    currentHeadings = data.headings || [];
    currentFileType = data.fileType || null;

    // 根据文件类型执行客户端渲染
    if (data.clientRender === 'katex') {
        renderKatex();
    } else if (data.clientRender === 'mermaid') {
        renderMermaid();
    } else if (currentFileType === 'markdown' || !currentFileType) {
        renderKatex();
        renderMermaid();
    }

    // 为代码块添加按钮（复制、切换视图）
    addCodeBlockButtons();

    // Markdown 专有功能
    if (currentFileType === 'markdown' || !currentFileType) {
        bindCheckboxEvents();
    }

    // 数据树类型：绑定 key 点击定位
    if (currentFileType === 'json' || currentFileType === 'yaml' || currentFileType === 'toml') {
        bindCommentTooltipInteractionGuard();
        bindTreeKeyClicks();
        bindCommentTooltips();
        highlightTreeRange(data.selectionStartLine, data.selectionEndLine);

        // 编辑时自动展开到修改行
        if (data.editedLine !== null && data.editedLine !== undefined) {
            expandToLine(data.editedLine);
        }
    }

    // 应用当前缩放级别
    applyZoom();

    if (data.preserveScrollPosition) {
        requestAnimationFrame(() => {
            content.scrollTop = previousScrollTop;
        });
    } else if (Object.prototype.hasOwnProperty.call(data, 'scrollToHeadingId')) {
        requestAnimationFrame(() => {
            scrollToHeading(data.scrollToHeadingId);
        });
    }
}

function scrollToHeading(headingId) {
    if (!headingId) {
        document.getElementById('content').scrollTop = 0;
        return;
    }

    const element = document.getElementById(headingId);
    if (element) {
        isScrollingFromEditor = true;
        element.scrollIntoView({ behavior: 'instant', block: 'start' });
        setTimeout(() => {
            isScrollingFromEditor = false;
        }, 300);
    }
}

// 缩放功能
function applyZoom() {
    const content = document.getElementById('content');
    // 只对预览内容应用缩放，不影响 loading、空状态和报错
    const hasSpecialState = content.querySelector('.loading-state, .empty-state, .error-state');
    if (hasSpecialState) {
        content.style.zoom = '';
        return;
    }

    if (currentFileType === 'mermaid') {
        content.style.zoom = '';
        applyMermaidZoom();
        return;
    }

    content.classList.remove('is-mermaid-preview');
    content.style.zoom = zoomLevel / 100;
}

function applyMermaidZoom() {
    const content = document.getElementById('content');
    const container = content.querySelector('.mermaid-container');
    if (!container) {
        content.classList.remove('is-mermaid-preview');
        return;
    }

    bindMermaidPan(container);
    content.classList.add('is-mermaid-preview');

    const prevMaxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
    const prevMaxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
    const prevRatioX = prevMaxScrollLeft > 0 ? container.scrollLeft / prevMaxScrollLeft : 0;
    const prevRatioY = prevMaxScrollTop > 0 ? container.scrollTop / prevMaxScrollTop : 0;

    const mermaidScale = (zoomLevel / 100) * MERMAID_ZOOM_MULTIPLIER;
    const svgs = container.querySelectorAll('.mermaid svg');
    svgs.forEach(svg => {
        const baseSize = getMermaidSvgBaseSize(svg);
        if (!baseSize) {
            return;
        }
        svg.style.display = 'block';
        svg.style.maxWidth = 'none';
        svg.style.width = `${baseSize.width * mermaidScale}px`;
        svg.style.height = `${baseSize.height * mermaidScale}px`;
    });

    requestAnimationFrame(() => {
        const nextMaxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
        const nextMaxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
        container.scrollLeft = nextMaxScrollLeft > 0 ? prevRatioX * nextMaxScrollLeft : 0;
        container.scrollTop = nextMaxScrollTop > 0 ? prevRatioY * nextMaxScrollTop : 0;
        updateMermaidPannableState(container);
    });
}

function getMermaidSvgBaseSize(svg) {
    const cachedWidth = parseFloat(svg.dataset.baseWidth || '');
    const cachedHeight = parseFloat(svg.dataset.baseHeight || '');
    if (cachedWidth > 0 && cachedHeight > 0) {
        return { width: cachedWidth, height: cachedHeight };
    }

    let width = 0;
    let height = 0;

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        width = viewBox.width;
        height = viewBox.height;
    }

    if (!(width > 0 && height > 0)) {
        const attrWidth = parseFloat(svg.getAttribute('width') || '');
        const attrHeight = parseFloat(svg.getAttribute('height') || '');
        if (attrWidth > 0 && attrHeight > 0) {
            width = attrWidth;
            height = attrHeight;
        }
    }

    if (!(width > 0 && height > 0)) {
        try {
            const box = svg.getBBox();
            if (box.width > 0 && box.height > 0) {
                width = box.width;
                height = box.height;
            }
        } catch (_error) {
            // ignore and fallback below
        }
    }

    if (!(width > 0 && height > 0)) {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            width = rect.width;
            height = rect.height;
        }
    }

    if (!(width > 0 && height > 0)) {
        return null;
    }

    svg.dataset.baseWidth = String(width);
    svg.dataset.baseHeight = String(height);
    return { width, height };
}

function bindMermaidPan(container) {
    if (mermaidDragState.container === container) {
        updateMermaidPannableState(container);
        return;
    }

    if (mermaidDragState.container) {
        mermaidDragState.container.removeEventListener('mousedown', onMermaidMouseDown);
        mermaidDragState.container.classList.remove('is-dragging', 'is-pannable');
    }

    mermaidDragState.container = container;
    container.addEventListener('mousedown', onMermaidMouseDown);
    updateMermaidPannableState(container);
}

function teardownMermaidPan() {
    stopMermaidDragging();
    if (mermaidDragState.container) {
        mermaidDragState.container.removeEventListener('mousedown', onMermaidMouseDown);
        mermaidDragState.container.classList.remove('is-dragging', 'is-pannable');
        mermaidDragState.container = null;
    }
}

function updateMermaidPannableState(container) {
    container.classList.add('is-pannable');
}

function onMermaidMouseDown(e) {
    if (e.button !== 0) {
        return;
    }
    if (e.target && e.target.closest && e.target.closest('.copy-btn')) {
        return;
    }
    if (!mermaidDragState.container) {
        return;
    }

    mermaidDragState.dragging = true;
    mermaidDragState.startX = e.clientX;
    mermaidDragState.startY = e.clientY;
    mermaidDragState.startScrollLeft = mermaidDragState.container.scrollLeft;
    mermaidDragState.startScrollTop = mermaidDragState.container.scrollTop;
    mermaidDragState.container.classList.add('is-dragging');
    document.body.classList.add('mermaid-dragging');
    e.preventDefault();
}

function onMermaidMouseMove(e) {
    if (!mermaidDragState.dragging || !mermaidDragState.container) {
        return;
    }

    const deltaX = e.clientX - mermaidDragState.startX;
    const deltaY = e.clientY - mermaidDragState.startY;

    mermaidDragState.container.scrollLeft = mermaidDragState.startScrollLeft - deltaX;
    mermaidDragState.container.scrollTop = mermaidDragState.startScrollTop - deltaY;
}

function stopMermaidDragging() {
    if (!mermaidDragState.dragging) {
        return;
    }

    mermaidDragState.dragging = false;
    if (mermaidDragState.container) {
        mermaidDragState.container.classList.remove('is-dragging');
    }
    document.body.classList.remove('mermaid-dragging');
}

// 代码块复制按钮
function addCodeBlockButtons() {
    const preBlocks = document.querySelectorAll('pre');
    preBlocks.forEach(pre => {
        // 避免重复添加
        if (pre.querySelector('.copy-btn')) {
            return;
        }
        addCopyButton(pre);
    });
}

function addCopyButton(pre) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = l10n.copyCode;
    copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';

    let resetTimer = null;

    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (copyBtn.classList.contains('copied') || copyBtn.classList.contains('copy-failed')) {
            return;
        }
        const code = pre.querySelector('code');
        // 如果有 data-source (mermaid 渲染后)，优先使用
        const text = pre.getAttribute('data-source') || (code ? code.textContent : pre.textContent);

        try {
            await navigator.clipboard.writeText(text);
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="codicon codicon-pass-filled"></i>' + l10n.copySuccess;
        } catch (err) {
            console.error('Copy failed:', err);
            copyBtn.classList.add('copy-failed');
            copyBtn.textContent = 'FAILED';
        }
    });

    copyBtn.addEventListener('mouseleave', () => {
        if (copyBtn.classList.contains('copied') || copyBtn.classList.contains('copy-failed')) {
            if (resetTimer) {
                clearTimeout(resetTimer);
            }
            resetTimer = setTimeout(() => {
                copyBtn.classList.add('fade-out');
                setTimeout(() => {
                    copyBtn.classList.remove('copied', 'copy-failed', 'fade-out');
                    copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';
                    resetTimer = null;
                }, 300);
            }, 800);
        }
    });

    pre.appendChild(copyBtn);
}

// 绑定 task list checkbox 事件
function bindCheckboxEvents() {
    const checkboxes = document.querySelectorAll('li.task-list-item input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const line = parseInt(e.target.getAttribute('data-line'), 10);
            if (!isNaN(line) && line >= 0) {
                vscode.postMessage({
                    type: 'toggleCheckbox',
                    line: line,
                    checked: e.target.checked
                });
            }
        });
    });
}

// 报告当前预览中可见的标题
function reportVisibleHeading() {
    const content = document.getElementById('content');
    const contentRect = content.getBoundingClientRect();
    const headings = content.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');

    let visibleHeading = null;
    for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= contentRect.top + 50) {
            visibleHeading = heading;
        } else {
            break;
        }
    }

    vscode.postMessage({
        type: 'visibleHeading',
        headingId: visibleHeading ? visibleHeading.id : null
    });
}

// KaTeX 渲染
function renderKatex() {
    if (typeof katex === 'undefined') {
        return;
    }

    // 渲染块级公式
    const blocks = document.querySelectorAll('.katex-block');
    blocks.forEach(block => {
        if (!block.getAttribute('data-source')) {
            block.setAttribute('data-source', block.textContent);
        }
        try {
            const tex = block.getAttribute('data-source') || '';
            const cleaned = tex
                .replace(/^\$\$|\$\$$/g, '')
                .replace(/\\begin\{[^}]+\}/g, '')
                .replace(/\\end\{[^}]+\}/g, '')
                .trim();
            if (cleaned) {
                katex.render(cleaned, block, { displayMode: true, throwOnError: true });
            }
        } catch (e) {
            block.innerHTML = '<span class="render-error-inline">' + escapeHtml(getErrorMessage(e)) + '</span>';
        }
    });

    // 渲染行内公式
    const inlines = document.querySelectorAll('.katex-inline');
    inlines.forEach(span => {
        if (!span.getAttribute('data-source')) {
            span.setAttribute('data-source', span.textContent);
        }
        try {
            const tex = (span.getAttribute('data-source') || '').replace(/^\$|\$$/g, '').trim();
            if (tex) {
                katex.render(tex, span, { displayMode: false, throwOnError: true });
            }
        } catch (e) {
            span.innerHTML = '<span class="render-error-inline">' + escapeHtml(getErrorMessage(e)) + '</span>';
        }
    });
}

// Mermaid 渲染
function renderMermaid() {
    if (typeof mermaid === 'undefined') {
        const els = document.querySelectorAll('.mermaid');
        els.forEach(el => {
            el.innerHTML = '<div class="render-error-block">'
                + '<i class="codicon codicon-error"></i> Mermaid library failed to load'
                + '</div>';
        });
        return;
    }

    // 检测当前主题
    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');

    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
    });

    // 移除 data-processed 属性（允许重新渲染）
    const elements = document.querySelectorAll('.mermaid');
    elements.forEach(el => {
        if (!el.getAttribute('data-source')) {
            el.setAttribute('data-source', el.textContent);
        }
        el.removeAttribute('data-processed');
    });

    // 使用 mermaid.run() 进行就地渲染
    const renderPromise = Promise.race([
        mermaid.run({
            querySelector: '.mermaid',
            suppressErrors: false,
        }),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Mermaid rendering timeout')), MERMAID_RENDER_TIMEOUT_MS);
        })
    ]);

    renderPromise.then(() => {
        if (currentFileType !== 'mermaid') {
            return;
        }
        elements.forEach(el => {
            const svg = el.querySelector('svg');
            if (svg) {
                svg.style.display = 'block';
                svg.style.maxWidth = 'none';
                getMermaidSvgBaseSize(svg);
            }
        });
    }).catch(err => {
        const errorMessage = escapeHtml(getErrorMessage(err));
        elements.forEach(el => {
            if (!el.querySelector('svg')) {
                el.innerHTML = '<div class="render-error-block">'
                    + '<i class="codicon codicon-error"></i> '
                    + errorMessage
                    + '</div>';
            }
        });
    }).finally(() => {
        applyZoom();
    });
}

// 显示 loading 状态
function showLoading() {
    const content = document.getElementById('content');
    teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    content.classList.add('is-loading');
    content.style.zoom = '';
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
}

// 展开树形视图到指定行
function expandToLine(targetLine) {
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
        if (!isNaN(line) && line <= targetLine && line > bestLine) {
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
                const dist = Math.abs(line - targetLine);
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

function clearTreeHighlights() {
    const highlightedItems = document.querySelectorAll('.data-tree .tree-item.is-highlight');
    highlightedItems.forEach(item => item.classList.remove('is-highlight'));
}

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
        const matchedItems = collectNearestTreeItems(inRange);
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

function isElementWithinCommentTooltip(element) {
    if (!commentTooltip || !(element instanceof Node)) {
        return false;
    }
    return element === commentTooltip || commentTooltip.contains(element);
}

function isCommentTooltipInteractionLocked() {
    return Boolean(
        commentTooltipFocusLocked
        && commentTooltip
        && commentTooltip.classList.contains('is-visible')
    );
}

function isLockedToDifferentCommentTarget(target) {
    return Boolean(
        isCommentTooltipInteractionLocked()
        && commentTooltipTarget
        && commentTooltipTarget !== target
    );
}

function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
    }
}

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

function showCommentTooltip(target) {
    const comments = parseCommentPayload(target);
    if (comments.length === 0) {
        return;
    }

    clearCommentTooltipHideTimer();
    const tooltip = ensureCommentTooltip();
    renderCommentTooltipItems(tooltip, comments);
    commentTooltipTarget = target;
    tooltip.classList.add('is-visible');
    updateCommentTooltipFocusClass();
    positionCommentTooltip();
}

function clearCommentTooltipHideTimer() {
    if (!commentTooltipHideTimer) {
        return;
    }
    clearTimeout(commentTooltipHideTimer);
    commentTooltipHideTimer = null;
}

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

function updateCommentTooltipFocusClass() {
    if (!commentTooltip) {
        return;
    }
    commentTooltip.classList.toggle('is-focused', commentTooltipFocusLocked);
}

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
    commentTooltip.classList.remove('is-visible');
    commentTooltip.classList.remove('is-focused');
    commentTooltipTarget = null;
}

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

    commentTooltip.style.left = `${left}px`;
    commentTooltip.style.top = `${top}px`;
}

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

// 绑定树形视图 key 点击事件
function bindTreeKeyClicks() {
    const keys = document.querySelectorAll('.data-tree .tree-key[data-line]');
    keys.forEach(key => {
        key.addEventListener('click', (e) => {
            if (isCommentTooltipInteractionLocked()) {
                stopEvent(e);
                return;
            }
            e.stopPropagation();
            e.preventDefault();
            const line = parseInt(key.getAttribute('data-line'), 10);
            if (!isNaN(line) && line >= 0) {
                vscode.postMessage({
                    type: 'navigateToLine',
                    line: line
                });
            }
        });
    });
}

// 展开所有树形节点
function expandAllNodes() {
    const details = document.querySelectorAll('.data-tree details');
    details.forEach(d => d.setAttribute('open', ''));
}

// 折叠所有树形节点
function collapseAllNodes() {
    const details = document.querySelectorAll('.data-tree details');
    details.forEach(d => d.removeAttribute('open'));
}
