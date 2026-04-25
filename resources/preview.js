// VS Code Webview 通信对象，用于前后端消息交互
const VSCODE_API = acquireVsCodeApi();
// 从 HTML data-* 注入的多语言文案源
const L10N_SOURCE = document.body ? document.body.dataset : {};
// Webview 内部使用的本地化文案字典
const L10N_TEXT = {
    copySuccess: L10N_SOURCE.copySuccess || 'COPIED!',
    copyCode: L10N_SOURCE.copyCode || 'Copy',
    viewCode: L10N_SOURCE.viewCode || 'Code',
    viewPreview: L10N_SOURCE.viewPreview || 'Preview',
};
// 允许接收的消息类型枚举，避免无效消息触发渲染流程
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
// 需要启用数据树交互能力的文件类型枚举
const DATA_TREE_FILE_TYPES = new Set(['json', 'yaml', 'toml', 'xml']);
// 预览缩放可选档位配置
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300, 400];
// Mermaid 额外放大倍数，用于提升图表可读性
const MERMAID_ZOOM_MULTIPLIER = 2;
// Mermaid 渲染超时时间（毫秒）
const MERMAID_RENDER_TIMEOUT_MS = 5000;
// 注释提示框离开后延迟隐藏时间（毫秒）
const COMMENT_TOOLTIP_HIDE_DELAY_MS = 240;
// 注释提示框点击后屏蔽 hover 的时间窗口（毫秒）
const COMMENT_TOOLTIP_CLICK_BLOCK_WINDOW_MS = 260;
// Mermaid 拖拽平移过程中的全局状态
const MERMAID_DRAG_STATE = {
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

/**
 * 处理HTML相关逻辑并返回结果
 * @param value - 待转义或待归一化的值
 * @returns 返回 HTML 转义后的字符串
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 获取错误消息并返回结果
 * @param error - 待展示的异常对象
 * @returns 返回可展示的错误消息文本
 */
function getErrorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return String(error || 'Unknown error');
}

/**
 * 归一化可选字符串以统一后续处理
 * @param value - 待转义或待归一化的值
 * @returns 返回标准化后的字符串或 null
 */
function normalizeOptionalString(value) {
    return typeof value === 'string' ? value : null;
}

/**
 * 归一化行值以统一后续处理
 * @param value - 待转义或待归一化的值
 * @returns 返回合法的行号值或 null
 */
function normalizeLineValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 归一化消息行范围以统一后续处理
 * @param startLine - 起始行号
 * @param endLine - 结束行号
 * @returns 返回归一化后的行范围对象
 */
function normalizeMessageLineRange(startLine, endLine) {
    const start = normalizeLineValue(startLine);
    if (start === null) {
        return null;
    }

    const end = endLine === null || endLine === undefined
        ? start
        : normalizeLineValue(endLine);

    if (end === null) {
        return null;
    }

    return { start, end };
}

/**
 * 归一化缩放级别以统一后续处理
 * @param level - 目标缩放级别
 * @returns 返回最近的合法缩放档位
 */
function normalizeZoomLevel(level) {
    const parsed = Number(level);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return ZOOM_STEPS.reduce((nearest, step) => {
        if (Math.abs(step - parsed) < Math.abs(nearest - parsed)) {
            return step;
        }
        return nearest;
    }, ZOOM_STEPS[0]);
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
            scrollToHeading(normalizeOptionalString(message.headingId));
            break;
        case 'getVisibleHeading':
            reportVisibleHeading();
            break;
        case 'zoom':
            {
                const nextZoom = normalizeZoomLevel(message.level);
                if (nextZoom === null) {
                    break;
                }
                zoomLevel = nextZoom;
            }
            applyZoom();
            break;
        case 'expandAll':
            expandAllNodes();
            break;
        case 'collapseAll':
            collapseAllNodes();
            break;
        case 'highlightDataTreeRange':
            {
                const range = normalizeMessageLineRange(message.startLine, message.endLine);
                if (!range) {
                    break;
                }
                highlightTreeRange(range.start, range.end);
            }
            break;
    }
});

VSCODE_API.postMessage({ type: 'webviewReady' });

// 监听滚轮事件，支持 cmd/ctrl + 轮缩放
document.addEventListener('wheel', (e) => {
    // 在 macOS 使用 metaKey (cmd)，在 Windows/Linux 使用 ctrlKey
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

/**
 * 通知扩展缩放级别变化
 * 处理缩放变更相关逻辑并返回结果
 */
function notifyZoomChange() {
    VSCODE_API.postMessage({
        type: 'zoomChange',
        level: zoomLevel
    });
}

/**
 * 更新内容并同步相关结果
 * @param data - 来自扩展端的渲染消息
 */
function updateContent(data) {
    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    const messageData = (data && typeof data === 'object') ? data : {};
    const previousScrollTop = content.scrollTop;
    hideCommentTooltip(true);
    teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    content.classList.remove('is-loading');
    
    // 如果后端传来 baseUri，则在 head 中设置 <base>，使相对路径（如 screenshots/xxx.png）能被解析为 webview 资源
    if (typeof messageData.baseUri === 'string' && messageData.baseUri.length > 0) {
        let base = document.querySelector('base');
        if (!base) {
            base = document.createElement('base');
            document.head.appendChild(base);
        }
        base.setAttribute('href', messageData.baseUri.endsWith('/') ? messageData.baseUri : messageData.baseUri + '/');
    }

    content.innerHTML = typeof messageData.content === 'string' ? messageData.content : '';
    currentHeadings = Array.isArray(messageData.headings) ? messageData.headings : [];
    currentFileType = typeof messageData.fileType === 'string' ? messageData.fileType : null;

    // 根据文件类型执行客户端渲染
    if (messageData.clientRender === 'katex') {
        renderKatex();
    } else if (messageData.clientRender === 'mermaid') {
        renderMermaid();
    } else if (currentFileType === 'markdown' || !currentFileType) {
        renderKatex();
        renderMermaid();
    }

    // 为代码块添加按钮（复制、切换视图）
    addCodeBlockButtons();

    // 仅在 Markdown 预览中启用的功能
    if (currentFileType === 'markdown' || !currentFileType) {
        bindCheckboxEvents();
    }

    // 数据树类型：绑定 key 点击定位
    if (DATA_TREE_FILE_TYPES.has(currentFileType)) {
        bindCommentTooltipInteractionGuard();
        bindTreeKeyClicks();
        bindCommentTooltips();
        highlightTreeRange(messageData.selectionStartLine, messageData.selectionEndLine);

        // 编辑时自动展开到修改行
        const editedLine = normalizeLineValue(messageData.editedLine);
        if (editedLine !== null) {
            expandToLine(editedLine);
        }
    }

    // 应用当前缩放级别
    applyZoom();

    if (messageData.preserveScrollPosition) {
        requestAnimationFrame(() => {
            content.scrollTop = previousScrollTop;
        });
    } else if (Object.prototype.hasOwnProperty.call(messageData, 'scrollToHeadingId')) {
        requestAnimationFrame(() => {
            scrollToHeading(normalizeOptionalString(messageData.scrollToHeadingId));
        });
    }
}

/**
 * 将预览滚动到指定锚点，缺省时回到顶部
 * @param headingId - 目标标题锚点 ID
 */
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

/**
 * 缩放功能
 * 处理缩放相关逻辑并返回结果
 */
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

/**
 * 根据当前缩放级别调整 Mermaid 图表尺寸与滚动位置
 */
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

/**
 * 获取 Mermaid SVG 的基础尺寸，用于后续缩放计算
 * @param svg - Mermaid SVG 节点
 * @returns 返回 Mermaid SVG 的基础宽高
 */
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
            // 忽略 getBBox 异常，继续使用后续兜底尺寸来源
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

/**
 * 绑定 Mermaid 画布的拖拽平移能力
 * @param container - Mermaid 图表滚动容器
 */
function bindMermaidPan(container) {
    if (MERMAID_DRAG_STATE.container === container) {
        updateMermaidPannableState(container);
        return;
    }

    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.removeEventListener('mousedown', onMermaidMouseDown);
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging', 'is-pannable');
    }

    MERMAID_DRAG_STATE.container = container;
    container.addEventListener('mousedown', onMermaidMouseDown);
    updateMermaidPannableState(container);
}

/**
 * 解除 Mermaid 画布拖拽平移绑定并重置状态
 */
function teardownMermaidPan() {
    stopMermaidDragging();
    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.removeEventListener('mousedown', onMermaidMouseDown);
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging', 'is-pannable');
        MERMAID_DRAG_STATE.container = null;
    }
}

/**
 * 更新 Mermaid 画布是否可拖拽的视觉状态
 * @param container - Mermaid 图表滚动容器
 */
function updateMermaidPannableState(container) {
    container.classList.add('is-pannable');
}

/**
 * 记录拖拽起点并进入 Mermaid 画布拖拽状态
 * @param e - 浏览器事件对象
 */
function onMermaidMouseDown(e) {
    if (e.button !== 0) {
        return;
    }
    if (e.target && e.target.closest && e.target.closest('.copy-btn')) {
        return;
    }
    if (!MERMAID_DRAG_STATE.container) {
        return;
    }

    MERMAID_DRAG_STATE.dragging = true;
    MERMAID_DRAG_STATE.startX = e.clientX;
    MERMAID_DRAG_STATE.startY = e.clientY;
    MERMAID_DRAG_STATE.startScrollLeft = MERMAID_DRAG_STATE.container.scrollLeft;
    MERMAID_DRAG_STATE.startScrollTop = MERMAID_DRAG_STATE.container.scrollTop;
    MERMAID_DRAG_STATE.container.classList.add('is-dragging');
    document.body.classList.add('mermaid-dragging');
    e.preventDefault();
}

/**
 * 根据鼠标位移更新 Mermaid 画布滚动位置
 * @param e - 浏览器事件对象
 */
function onMermaidMouseMove(e) {
    if (!MERMAID_DRAG_STATE.dragging || !MERMAID_DRAG_STATE.container) {
        return;
    }

    const deltaX = e.clientX - MERMAID_DRAG_STATE.startX;
    const deltaY = e.clientY - MERMAID_DRAG_STATE.startY;

    MERMAID_DRAG_STATE.container.scrollLeft = MERMAID_DRAG_STATE.startScrollLeft - deltaX;
    MERMAID_DRAG_STATE.container.scrollTop = MERMAID_DRAG_STATE.startScrollTop - deltaY;
}

/**
 * 结束 Mermaid 画布拖拽并清理交互状态
 */
function stopMermaidDragging() {
    if (!MERMAID_DRAG_STATE.dragging) {
        return;
    }

    MERMAID_DRAG_STATE.dragging = false;
    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging');
    }
    document.body.classList.remove('mermaid-dragging');
}

/**
 * 代码块复制按钮
 * 处理代码块按钮相关逻辑并返回结果
 */
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

/**
 * 处理复制按钮相关逻辑并返回结果
 * @param pre - 目标代码块容器
 */
function addCopyButton(pre) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = L10N_TEXT.copyCode;
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
            copyBtn.innerHTML = '<i class="codicon codicon-pass-filled"></i>' + L10N_TEXT.copySuccess;
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

/**
 * 绑定任务列表复选框事件
 * 绑定任务列表复选框变更事件，并同步回编辑器
 */
function bindCheckboxEvents() {
    const checkboxes = document.querySelectorAll('li.task-list-item input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const line = parseInt(e.target.getAttribute('data-line'), 10);
            if (!isNaN(line) && line >= 0) {
                VSCODE_API.postMessage({
                    type: 'toggleCheckbox',
                    line: line,
                    checked: e.target.checked
                });
            }
        });
    });
}

/**
 * 报告当前预览中可见的标题
 * 计算当前可见锚点并回传给扩展端
 */
function reportVisibleHeading() {
    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    const contentRect = content.getBoundingClientRect();
    let visibleHeadingId = null;

    // 顶部优先回传 frontmatter-table，保证「定位到顶部」可稳定落点
    const frontMatterTable = content.querySelector('#frontmatter-table');
    if (frontMatterTable instanceof HTMLElement) {
        const fmRect = frontMatterTable.getBoundingClientRect();
        const fmVisibleNearTop = fmRect.bottom >= contentRect.top + 10 && fmRect.top <= contentRect.top + 50;
        if (content.scrollTop <= 2 || fmVisibleNearTop) {
            visibleHeadingId = 'frontmatter-table';
        }
    }

    if (!visibleHeadingId) {
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
        visibleHeadingId = visibleHeading ? visibleHeading.id : null;
    }

    VSCODE_API.postMessage({
        type: 'visibleHeading',
        headingId: visibleHeadingId
    });
}

/**
 * 渲染 KaTeX
 * 渲染页面中的 KaTeX 占位节点
 */
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

/**
 * 渲染 Mermaid
 * 渲染页面中的 Mermaid 图表节点
 */
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

/**
 * 显示 loading 状态
 * 显示加载状态
 */
function showLoading() {
    const content = document.getElementById('content');
    teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    content.classList.add('is-loading');
    content.style.zoom = '';
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
}

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

    commentTooltip.style.left = `${left}px`;
    commentTooltip.style.top = `${top}px`;
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

/**
 * 绑定树形视图 key 点击事件
 * 绑定数据树键名点击事件并回传导航行号
 */
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
