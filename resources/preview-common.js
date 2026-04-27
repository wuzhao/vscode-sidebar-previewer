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
    tableSelectionMore: L10N_SOURCE.tableSelectionMore || 'Actions',
    tableSelectionAscii: L10N_SOURCE.tableSelectionAscii || 'Copy As ASCII',
    tableSelectionTsv: L10N_SOURCE.tableSelectionTsv || 'Copy As TSV',
};
// 允许接收的消息类型枚举，避免无效消息触发渲染流程
const VALID_MESSAGE_TYPES = new Set([
    'update',
    'loading',
    'scrollToHeading',
    'getVisibleHeading',
    'scrollToLine',
    'getVisibleLine',
    'zoom',
    'expandAll',
    'collapseAll',
    'highlightDataTreeRange',
    'highlightTableRange'
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
const COMMENT_TOOLTIP_HIDE_DELAY_MS = 200;
// 注释提示框点击后屏蔽 hover 的时间窗口（毫秒）
const COMMENT_TOOLTIP_CLICK_BLOCK_WINDOW_MS = 200;
// 表格预览容器与视口高度差值（像素）
const TABLE_PREVIEW_VIEWPORT_OFFSET_PX = 24;

let currentHeadings = [];
let isScrollingFromEditor = false;
let isUpdatingSelectionFromWebview = false;
let zoomLevel = 100;
let wheelTimeout = null;
let currentFileType = null;

/**
 * 获取预览内容容器
 * @returns 返回预览内容容器元素
 */
function getPreviewContentElement() {
    const content = document.getElementById('content');
    return content instanceof HTMLElement ? content : null;
}

/**
 * 设置预览区域焦点态样式标识
 * @param focused - 当前是否处于聚焦态
 */
function setPreviewFocusedClass(focused) {
    const content = getPreviewContentElement();
    if (!content) {
        return;
    }
    content.classList.toggle('preview-focused', !!focused);
}

/**
 * 同步预览区域焦点状态
 */
function syncPreviewFocusState() {
    const content = getPreviewContentElement();
    if (!content) {
        return;
    }
    const activeElement = document.activeElement;
    setPreviewFocusedClass(activeElement === content || (activeElement instanceof Node && content.contains(activeElement)));
}

/**
 * 主动聚焦预览内容区域
 */
function focusPreviewContent() {
    const content = getPreviewContentElement();
    if (!content) {
        return;
    }
    content.focus({ preventScroll: true });
    setPreviewFocusedClass(true);
}

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

// 监听来自扩展端的消息，根据消息类型分发到对应处理函数
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
            if (typeof PreviewMarkdown !== 'undefined' && PreviewMarkdown.scrollToHeading) {
                PreviewMarkdown.scrollToHeading(normalizeOptionalString(message.headingId));
            }
            break;
        case 'getVisibleHeading':
            if (typeof PreviewMarkdown !== 'undefined' && PreviewMarkdown.reportVisibleHeading) {
                PreviewMarkdown.reportVisibleHeading();
            }
            break;
        case 'scrollToLine':
            {
                const line = normalizeLineValue(message.line);
                if (line !== null && typeof PreviewTable !== 'undefined' && PreviewTable.scrollToLine) {
                    PreviewTable.scrollToLine(line);
                }
            }
            break;
        case 'getVisibleLine':
            if (typeof PreviewTable !== 'undefined' && PreviewTable.reportVisibleLine) {
                PreviewTable.reportVisibleLine();
            }
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
            if (typeof PreviewDatatree !== 'undefined') {
                PreviewDatatree.expandAllNodes();
            }
            if (typeof PreviewCommentTooltip !== 'undefined') {
                PreviewCommentTooltip.hideCommentTooltip(true);
            }
            break;
        case 'collapseAll':
            if (typeof PreviewDatatree !== 'undefined') {
                PreviewDatatree.collapseAllNodes();
            }
            if (typeof PreviewCommentTooltip !== 'undefined') {
                PreviewCommentTooltip.hideCommentTooltip(true);
            }
            break;
        case 'highlightDataTreeRange':
            {
                const range = normalizeMessageLineRange(message.startLine, message.endLine);
                if (!range) {
                    break;
                }
                if (typeof PreviewDatatree !== 'undefined') {
                    PreviewDatatree.highlightTreeRange(range.start, range.end);
                }
            }
            break;
        case 'highlightTableRange':
            {
                const startLine = normalizeLineValue(message.startLine);
                const startChar = normalizeLineValue(message.startChar);
                const endLine = normalizeLineValue(message.endLine);
                const endChar = normalizeLineValue(message.endChar);
                if (startLine !== null && startChar !== null && endLine !== null && endChar !== null) {
                    if (typeof PreviewTable !== 'undefined') {
                        PreviewTable.highlightTableRangeFunc(startLine, startChar, endLine, endChar);
                    }
                }
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

document.addEventListener('contextmenu', e => {
    e.preventDefault();
    return false;
}, true);

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

// PreviewCommon 命名空间：域注册中心，供各域模块登记初始化回调
const PreviewCommon = (function() {
    const _domainInits = [];

    /**
     * 注册域初始化回调
     * @param fileTypes - 对应的文件类型数组，null 表示始终执行
     * @param label - 域名称标识（用于错误日志）
     * @param initFn - 域初始化函数，接收 (fileType, messageData) 两个参数
     */
    function registerDomainInit(fileTypes, label, initFn) {
        _domainInits.push({ fileTypes: fileTypes, label: label, init: initFn });
    }

    /**
     * 按当前文件类型触发已注册的域初始化器
     * @param fileType - 当前预览文件的类型
     * @param messageData - update 消息携带的附加数据
     */
    function initDomains(fileType, messageData) {
        for (let i = 0; i < _domainInits.length; i++) {
            const entry = _domainInits[i];
            if (entry.fileTypes === null || entry.fileTypes.indexOf(fileType) !== -1) {
                try {
                    entry.init(fileType, messageData);
                } catch (e) {
                    console.error('Domain init error [' + entry.label + ']:', e);
                }
            }
        }
    }

    return {
        registerDomainInit: registerDomainInit,
        initDomains: initDomains,
        focusPreviewContent: focusPreviewContent,
        syncPreviewFocusState: syncPreviewFocusState
    };
})();

document.addEventListener('focusin', () => {
    syncPreviewFocusState();
});

document.addEventListener('focusout', () => {
    setTimeout(syncPreviewFocusState, 0);
});

window.addEventListener('focus', () => {
    syncPreviewFocusState();
});

window.addEventListener('blur', () => {
    setPreviewFocusedClass(false);
});

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
    if (typeof PreviewCommentTooltip !== 'undefined') PreviewCommentTooltip.hideCommentTooltip(true);
    if (typeof PreviewMermaid !== 'undefined') PreviewMermaid.teardownMermaidPan();
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
    content.setAttribute('tabindex', '0');
    content.setAttribute('role', 'region');
    if (!content.dataset.focusBound) {
        content.dataset.focusBound = 'true';
        content.addEventListener('mousedown', () => {
            focusPreviewContent();
        });
    }
    currentHeadings = Array.isArray(messageData.headings) ? messageData.headings : [];
    currentFileType = typeof messageData.fileType === 'string' ? messageData.fileType : null;

    // 客户端渲染专用路径：KaTeX / Mermaid 独立渲染模式
    if (messageData.clientRender === 'katex') {
        if (typeof PreviewKatex !== 'undefined') { PreviewKatex.renderKatex(); }
    } else if (messageData.clientRender === 'mermaid') {
        if (typeof PreviewMermaid !== 'undefined') { PreviewMermaid.renderMermaid(); }
    } else {
        // 常规渲染路径：先触发 KaTeX / Mermaid（Markdown 需要），再触发注册域
        if (currentFileType === 'markdown' || !currentFileType) {
            if (typeof PreviewKatex !== 'undefined') { PreviewKatex.renderKatex(); }
            if (typeof PreviewMermaid !== 'undefined') { PreviewMermaid.renderMermaid(); }
        }
        if (currentFileType === 'csv' || currentFileType === 'tsv') {
            if (typeof PreviewMermaid !== 'undefined') { PreviewMermaid.renderMermaid(); }
        }
        // 触发所有注册域（currentFileType 为空时默认按 markdown 处理）
        PreviewCommon.initDomains(currentFileType || 'markdown', messageData);
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
    } else if (Object.prototype.hasOwnProperty.call(messageData, 'scrollToLine')) {
        const line = normalizeLineValue(messageData.scrollToLine);
        if (line !== null && typeof PreviewTable !== 'undefined' && PreviewTable.scrollToLine) {
            requestAnimationFrame(() => {
                PreviewTable.scrollToLine(line);
            });
        }
    }

    syncPreviewFocusState();
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
 * 获取当前缩放比例
 * @returns 返回当前缩放比例
 */
function getZoomScale() {
    return zoomLevel / 100;
}

/**
 * 按缩放比例修正表格预览容器高度
 * 让视觉高度始终保持在 100vh - 24px
 */
function applyTablePreviewViewportHeight() {
    const zoomScale = getZoomScale();
    if (!(zoomScale > 0)) {
        return;
    }

    const tablePreviewContainers = document.querySelectorAll('.table-preview-scroll');
    tablePreviewContainers.forEach(container => {
        container.style.maxHeight = `calc(100vh / ${zoomScale} - ${TABLE_PREVIEW_VIEWPORT_OFFSET_PX}px)`;
    });
}

/**
 * 缩放功能
 * 处理缩放相关逻辑并返回结果
 */
function applyZoom() {
    const content = document.getElementById('content');
    const zoomScale = getZoomScale();
    // 缩放时自动取消 focus 并隐藏注释提示框
    if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.hideCommentTooltip) {
        PreviewCommentTooltip.hideCommentTooltip(true);
    }
    // 只对预览内容应用缩放，不影响 loading、空状态和报错
    const hasSpecialState = content.querySelector('.loading-state, .empty-state, .error-state');
    if (hasSpecialState) {
        content.style.zoom = '';
        if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.applyCommentTooltipZoom) {
            PreviewCommentTooltip.applyCommentTooltipZoom();
        }
        if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.positionCommentTooltip) {
            PreviewCommentTooltip.positionCommentTooltip();
        }
        return;
    }

    if (currentFileType === 'mermaid') {
        content.style.zoom = '';
        if (typeof PreviewMermaid !== 'undefined' && PreviewMermaid.applyMermaidZoom) {
            PreviewMermaid.applyMermaidZoom();
        }
        if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.applyCommentTooltipZoom) {
            PreviewCommentTooltip.applyCommentTooltipZoom();
        }
        if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.positionCommentTooltip) {
            PreviewCommentTooltip.positionCommentTooltip();
        }
        return;
    }

    content.classList.remove('is-mermaid-preview');
    content.style.zoom = zoomScale;
    applyTablePreviewViewportHeight();
    if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.applyCommentTooltipZoom) {
        PreviewCommentTooltip.applyCommentTooltipZoom();
    }
    if (typeof PreviewCommentTooltip !== 'undefined' && PreviewCommentTooltip.positionCommentTooltip) {
        PreviewCommentTooltip.positionCommentTooltip();
    }
}

/**
 * 显示 loading 状态
 * 显示加载状态
 */
function showLoading() {
    const content = document.getElementById('content');
    if (typeof PreviewMermaid !== 'undefined') PreviewMermaid.teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    content.classList.add('is-loading');
    content.style.zoom = '';
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
}
