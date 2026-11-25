// VS Code Webview 通信对象，用于前后端消息交互
const VSCODE_API = acquireVsCodeApi();
// 从 HTML data-* 注入的多语言文案源
const L10N_SOURCE = document.body ? document.body.dataset : {};
// Webview 内部使用的本地化文案字典
const L10N_TEXT = {
    previewError: L10N_SOURCE.previewError || 'Preview error',
    copyCode: L10N_SOURCE.copyCode || 'Copy',
    wrapCode: L10N_SOURCE.wrapCode || 'Word Wrap',
    unwrapCode: L10N_SOURCE.unwrapCode || 'No Word Wrap',
    viewCode: L10N_SOURCE.viewCode || 'Code',
    viewPreview: L10N_SOURCE.viewPreview || 'Preview',
    tableSelectionMore: L10N_SOURCE.tableSelectionMore || 'Actions',
    tableSelectionMarkdown: L10N_SOURCE.tableSelectionMarkdown || 'Copy as Markdown',
    tableSelectionAscii: L10N_SOURCE.tableSelectionAscii || 'Copy as ASCII',
    tableSelectionTsv: L10N_SOURCE.tableSelectionTsv || 'Copy as TSV',
    tableSelectionTsvHint: L10N_SOURCE.tableSelectionTsvHint || 'For Excel, Numbers & Sheets',
    tableSelectionCsv: L10N_SOURCE.tableSelectionCsv || 'Copy as CSV',
    copyFailed: L10N_SOURCE.copyFailed || 'FAILED',
    unknownError: L10N_SOURCE.unknownError || 'Unknown error',
    mermaidRenderTimeout: L10N_SOURCE.mermaidRenderTimeout || 'Mermaid rendering timeout',
    mermaidLibraryLoadFailed: L10N_SOURCE.mermaidLibraryLoadFailed || 'Mermaid library failed to load',
};

/**
 * 解析扩展端注入的 Webview 共享配置
 * @param value - HTML data-* 属性携带的 JSON 配置
 * @returns 可供客户端读取的配置对象
 */
function parseRuntimeConfig(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return {};
    }
    try {
        const config = JSON.parse(value);
        return config && typeof config === 'object' ? config : {};
    } catch (_) {
        return {};
    }
}

// 扩展端与 Webview 共用的格式、缩放和消息协议配置
const RUNTIME_CONFIG = parseRuntimeConfig(L10N_SOURCE.previewConfig);
const EXTENSION_TO_WEBVIEW_MESSAGE_TYPES = Object.freeze(RUNTIME_CONFIG.extensionToWebviewMessageTypes || {});
const WEBVIEW_TO_EXTENSION_MESSAGE_TYPES = Object.freeze(RUNTIME_CONFIG.webviewToExtensionMessageTypes || {});
// 允许接收的消息类型枚举，避免无效消息触发渲染流程
const VALID_MESSAGE_TYPES = new Set(Object.values(EXTENSION_TO_WEBVIEW_MESSAGE_TYPES));
// 需要启用数据树交互能力的文件类型枚举
const DATA_TREE_FILE_TYPES = new Set(Array.isArray(RUNTIME_CONFIG.dataTreeFileTypes) ? RUNTIME_CONFIG.dataTreeFileTypes : []);
// 需要禁用全选快捷键的文件类型枚举
const NO_SELECT_ALL_FILE_TYPES = new Set(['csv', 'tsv', ...DATA_TREE_FILE_TYPES]);
// 预览缩放可选档位配置
const ZOOM_STEPS = Array.isArray(RUNTIME_CONFIG.zoomSteps) && RUNTIME_CONFIG.zoomSteps.length > 0
    ? RUNTIME_CONFIG.zoomSteps
    : [100];
// Mermaid 渲染超时时间（毫秒）
const MERMAID_RENDER_TIMEOUT_MS = 5000;
// 注释提示框离开后延迟隐藏时间（毫秒）
const COMMENT_TOOLTIP_HIDE_DELAY_MS = 200;
// 注释提示框悬停后延迟展示时间（毫秒）
const COMMENT_TOOLTIP_SHOW_DELAY_MS = 400;
// 注释提示框点击后屏蔽 hover 的时间窗口（毫秒）
const COMMENT_TOOLTIP_CLICK_BLOCK_WINDOW_MS = 200;
// 表格预览容器与视口高度差值（像素）
const TABLE_PREVIEW_VIEWPORT_OFFSET_PX = 24;
// 按类型映射到 CSS data-* 属性，供按需加载样式使用
const CSS_SCOPE_DATASET_KEY = {
    markdown: 'cssMarkdown',
    mermaid: 'cssMermaid',
    latex: 'cssLatex',
    table: 'cssTable',
    highlight: 'cssHighlight',
    codeblock: 'cssCodeblock',
    datatree: 'cssDatatree',
    katex: 'cssKatex'
};
// 按功能域映射到脚本 data-* 属性，供预览类型按需加载资源
const SCRIPT_SCOPE_DATASET_KEY = {
    codeblock: 'jsCodeblock',
    katexVendor: 'jsKatexVendor',
    katex: 'jsKatex',
    mermaidVendor: 'jsMermaidVendor',
    mermaid: 'jsMermaid',
    markdown: 'jsMarkdown',
    commentTooltip: 'jsCommentTooltip',
    datatree: 'jsDatatree',
    table: 'jsTable'
};
// 复用已发起的资源加载任务，避免切换文件时重复执行脚本
const SCRIPT_LOAD_PROMISES = new Map();

let currentHeadings = [];
let isUpdatingSelectionFromWebview = false;
let zoomLevel = 100;
let wheelTimeout = null;
let currentFileType = null;
let latestUpdateSequence = 0;

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
    return String(error || L10N_TEXT.unknownError);
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

/**
 * 校验并归一化可用于 link/base 的 URI
 * @param value - 待校验 URI
 * @returns 返回安全 URI，非法时返回 null
 */
function sanitizeResourceUri(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return null;
    }
    try {
        const parsed = new URL(value, window.location.href);
        const protocol = parsed.protocol.toLowerCase();
        if (
            protocol === 'https:' ||
            protocol === 'http:' ||
            protocol === 'data:' ||
            protocol === 'blob:' ||
            protocol === 'vscode-webview-resource:' ||
            protocol === 'vscode-resource:'
        ) {
            return parsed.toString();
        }
    } catch (_) {
        return null;
    }
    return null;
}

/**
 * 加载指定功能域的客户端脚本并复用同一加载任务
 * @param scope - SCRIPT_SCOPE_DATASET_KEY 中声明的功能域
 * @returns 脚本完成执行后的 Promise
 */
function loadPreviewScript(scope) {
    if (SCRIPT_LOAD_PROMISES.has(scope)) {
        return SCRIPT_LOAD_PROMISES.get(scope);
    }
    const datasetKey = SCRIPT_SCOPE_DATASET_KEY[scope];
    const src = document.body && datasetKey ? sanitizeResourceUri(document.body.dataset[datasetKey] || '') : null;
    if (!src) {
        return Promise.reject(new Error(L10N_TEXT.unknownError));
    }

    const loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.dataset.previewScriptScope = scope;
        script.addEventListener('load', () => resolve(), { once: true });
        /**
         * 清除失败的脚本和缓存以允许下次预览重试
         */
        script.addEventListener('error', () => {
            SCRIPT_LOAD_PROMISES.delete(scope);
            script.remove();
            reject(new Error(scope === 'mermaidVendor' ? L10N_TEXT.mermaidLibraryLoadFailed : L10N_TEXT.unknownError));
        }, { once: true });
        document.body.appendChild(script);
    });
    SCRIPT_LOAD_PROMISES.set(scope, loadPromise);
    return loadPromise;
}

/**
 * 按预览类型加载渲染和交互所需的最小脚本集合
 * @param fileType - 当前预览文件类型
 * @returns 所有依赖按顺序执行完成后的 Promise
 */
async function ensurePreviewScripts(fileType) {
    if (fileType === 'csv' || fileType === 'tsv') {
        await loadPreviewScript('table');
        return;
    }
    if (DATA_TREE_FILE_TYPES.has(fileType)) {
        await loadPreviewScript('commentTooltip');
        await loadPreviewScript('datatree');
        return;
    }
    if (fileType === 'latex') {
        await loadPreviewScript('katexVendor');
        await loadPreviewScript('katex');
        return;
    }
    if (fileType === 'mermaid') {
        await loadPreviewScript('mermaidVendor');
        await loadPreviewScript('mermaid');
        return;
    }

    await loadPreviewScript('codeblock');
    await loadPreviewScript('katexVendor');
    await loadPreviewScript('katex');
    await loadPreviewScript('mermaidVendor');
    await loadPreviewScript('mermaid');
    await loadPreviewScript('markdown');
    await loadPreviewScript('table');
}

/**
 * 将输入 HTML 清洗为安全的文档片段
 * @param value - 待渲染 HTML 文本
 * @returns 返回可插入 DOM 的安全片段
 */
function buildSafeContentFragment(value) {
    const html = typeof value === 'string' ? value : '';
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(html, 'text/html');
    const forbiddenNodes = parsedDoc.body.querySelectorAll('script, style, form, iframe, object, embed, link, meta, base');
    forbiddenNodes.forEach(node => node.remove());

    const nodesWithAttrs = parsedDoc.body.querySelectorAll('*');
    nodesWithAttrs.forEach(node => {
        const attrs = Array.from(node.attributes);
        attrs.forEach(attr => {
            const attrName = attr.name.toLowerCase();
            const attrValue = attr.value || '';
            if (attrName.startsWith('on')) {
                node.removeAttribute(attr.name);
                return;
            }
            if (attrName === 'style') {
                node.removeAttribute(attr.name);
                return;
            }
            if (
                (attrName === 'href' || attrName === 'src' || attrName === 'xlink:href') &&
                /^\s*javascript:/i.test(attrValue)
            ) {
                node.removeAttribute(attr.name);
            }
        });
    });

    const fragment = document.createDocumentFragment();
    while (parsedDoc.body.firstChild) {
        fragment.appendChild(parsedDoc.body.firstChild);
    }
    return fragment;
}

/**
 * 按文件类型解析所需样式域
 * @param fileType - 当前文件类型
 * @returns 返回需要加载的样式域集合
 */
function resolveCssScopes(fileType) {
    const scopes = new Set();
    if (fileType === 'csv' || fileType === 'tsv') {
        scopes.add('table');
        return scopes;
    }
    if (DATA_TREE_FILE_TYPES.has(fileType)) {
        scopes.add('datatree');
        return scopes;
    }
    if (fileType === 'mermaid') {
        scopes.add('mermaid');
        return scopes;
    }
    if (fileType === 'latex') {
        scopes.add('latex');
        scopes.add('katex');
        return scopes;
    }
    scopes.add('codeblock');
    scopes.add('markdown');
    scopes.add('table');
    scopes.add('highlight');
    scopes.add('latex');
    scopes.add('katex');
    scopes.add('mermaid');
    return scopes;
}

/**
 * 按需加载并切换样式资源
 * @param fileType - 当前文件类型
 */
function applyCssScopes(fileType) {
    const requiredScopes = fileType ? resolveCssScopes(fileType) : new Set();
    const scopedLinks = document.head.querySelectorAll('link[data-preview-css-scope]');
    scopedLinks.forEach(link => {
        if (!(link instanceof HTMLLinkElement)) {
            return;
        }
        const scope = link.dataset.previewCssScope;
        if (!scope || !requiredScopes.has(scope)) {
            link.remove();
        }
    });

    requiredScopes.forEach(scope => {
        const selector = `link[data-preview-css-scope="${scope}"]`;
        if (document.head.querySelector(selector)) {
            return;
        }
        const datasetKey = CSS_SCOPE_DATASET_KEY[scope];
        const href = document.body && datasetKey ? sanitizeResourceUri(document.body.dataset[datasetKey] || '') : null;
        if (!href) {
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.previewCssScope = scope;
        document.head.appendChild(link);
    });
}

// 监听来自扩展端的消息，根据消息类型分发到对应处理函数
window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !VALID_MESSAGE_TYPES.has(message.type)) {
        return;
    }

    switch (message.type) {
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.update:
            updateContent(message);
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.loading:
            showLoading();
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.scrollToHeading:
            scrollToHeading(normalizeOptionalString(message.headingId));
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.getVisibleHeading:
            reportVisibleHeading();
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.scrollToLine:
            {
                const line = normalizeLineValue(message.line);
                if (line !== null && typeof PreviewTable !== 'undefined' && PreviewTable.scrollToLine) {
                    PreviewTable.scrollToLine(line);
                }
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.getVisibleLine:
            if (typeof PreviewTable !== 'undefined' && PreviewTable.reportVisibleLine) {
                PreviewTable.reportVisibleLine();
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.zoom:
            {
                const nextZoom = normalizeZoomLevel(message.level);
                if (nextZoom === null) {
                    break;
                }
                zoomLevel = nextZoom;
            }
            applyZoom();
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.expandAll:
            if (typeof PreviewDatatree !== 'undefined') {
                PreviewDatatree.expandAllNodes();
            }
            if (typeof PreviewCommentTooltip !== 'undefined') {
                PreviewCommentTooltip.hideCommentTooltip(true);
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.collapseAll:
            if (typeof PreviewDatatree !== 'undefined') {
                PreviewDatatree.collapseAllNodes();
            }
            if (typeof PreviewCommentTooltip !== 'undefined') {
                PreviewCommentTooltip.hideCommentTooltip(true);
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.highlightDataTreeRange:
            if (typeof PreviewDatatree !== 'undefined') {
                PreviewDatatree.highlightTreeRange(message.startLine, message.endLine);
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.getHighlightedDataTreeLocator:
            if (typeof PreviewDatatree !== 'undefined' && PreviewDatatree.reportHighlightedLocator) {
                PreviewDatatree.reportHighlightedLocator();
            }
            break;
        case EXTENSION_TO_WEBVIEW_MESSAGE_TYPES.highlightTableRange:
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

VSCODE_API.postMessage({ type: WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.webviewReady });

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

// 拦截指定文件类型的全选快捷键，避免预览触发整页选中
document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) {
        return;
    }
    if (typeof e.key !== 'string' || e.key.toLowerCase() !== 'a') {
        return;
    }
    if (!currentFileType || !NO_SELECT_ALL_FILE_TYPES.has(currentFileType)) {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
}, true);

/**
 * 通知扩展缩放级别变化
 * 处理缩放变更相关逻辑并返回结果
 */
function notifyZoomChange() {
    VSCODE_API.postMessage({
        type: WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.zoomChange,
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
    const messageData = (data && typeof data === 'object') ? data : {};
    const fileType = typeof messageData.fileType === 'string' ? messageData.fileType : null;
    const updateSequence = ++latestUpdateSequence;
    void updateContentAfterLoading(messageData, fileType, updateSequence);
}

/**
 * 等待当前格式资源就绪后提交最新一次预览更新
 * @param messageData - 来自扩展端的渲染消息
 * @param fileType - 当前预览文件类型
 * @param updateSequence - 用于淘汰过时异步结果的递增序号
 */
async function updateContentAfterLoading(messageData, fileType, updateSequence) {
    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    if (!fileType) {
        showStatusContent(content, messageData.content);
        return;
    }
    try {
        await ensurePreviewScripts(fileType);
    } catch (error) {
        if (updateSequence !== latestUpdateSequence) {
            return;
        }
        if (fileType === 'mermaid') {
            VSCODE_API.postMessage({
                type: WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.mermaidRenderFailed,
                revision: messageData.revision, version: messageData.version, detail: getErrorMessage(error),
            });
        }
        showStatusContent(content, `<div class="error-state"><i class="codicon codicon-error"></i><div>${escapeHtml(getErrorMessage(error))}</div></div>`);
        return;
    }
    if (updateSequence !== latestUpdateSequence) {
        return;
    }

    clearPreviewInteractions(content);
    content.classList.remove('is-loading');

    // 如果后端传来 baseUri，则在 head 中设置 <base>，使相对路径（如 screenshots/xxx.png）能被解析为 webview 资源
    if (typeof messageData.baseUri === 'string' && messageData.baseUri.length > 0) {
        const safeBaseUri = sanitizeResourceUri(messageData.baseUri);
        if (safeBaseUri) {
            let base = document.querySelector('base');
            if (!base) {
                base = document.createElement('base');
                document.head.appendChild(base);
            }
            base.setAttribute('href', safeBaseUri.endsWith('/') ? safeBaseUri : safeBaseUri + '/');
        }
    }

    const contentHtml = typeof messageData.content === 'string' ? messageData.content : '';
    content.replaceChildren(buildSafeContentFragment(contentHtml));
    content.setAttribute('tabindex', '0');
    content.setAttribute('role', 'region');
    if (!content.dataset.focusBound) {
        content.dataset.focusBound = 'true';
        content.addEventListener('mousedown', () => {
            focusPreviewContent();
        });
    }
    currentHeadings = Array.isArray(messageData.headings) ? messageData.headings : [];
    currentFileType = fileType;
    applyCssScopes(fileType);

    // 客户端渲染专用路径：KaTeX / Mermaid 独立渲染模式
    if (messageData.clientRender === 'katex') {
        if (typeof PreviewKatex !== 'undefined') { PreviewKatex.renderKatex(); }
    } else if (messageData.clientRender === 'mermaid') {
        if (typeof PreviewMermaid !== 'undefined') { PreviewMermaid.renderMermaid(messageData, updateSequence); }
    } else {
        // 常规渲染路径：先触发 KaTeX / Mermaid（Markdown 需要），再触发注册域
        if (currentFileType === 'markdown' || !currentFileType) {
            if (typeof PreviewKatex !== 'undefined') { PreviewKatex.renderKatex(); }
            if (typeof PreviewMermaid !== 'undefined') { PreviewMermaid.renderMermaid(messageData, updateSequence); }
        }
        // 触发所有注册域（currentFileType 为空时默认按 markdown 处理）
        PreviewCommon.initDomains(currentFileType || 'markdown', messageData);
    }

    // 应用当前缩放级别
    applyZoom();

    if (Object.prototype.hasOwnProperty.call(messageData, 'scrollToHeadingId')) {
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

    // 顶部优先回传 frontmatter，保证「定位到顶部」可稳定落点
    const frontMatterTable = content.querySelector('#frontmatter');
    if (frontMatterTable instanceof HTMLElement) {
        const fmRect = frontMatterTable.getBoundingClientRect();
        const fmVisibleNearTop = fmRect.bottom >= contentRect.top + 10 && fmRect.top <= contentRect.top + 50;
        if (content.scrollTop <= 2 || fmVisibleNearTop) {
            visibleHeadingId = 'frontmatter';
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
        type: WEBVIEW_TO_EXTENSION_MESSAGE_TYPES.visibleHeading,
        headingId: visibleHeadingId
    });
}

/**
 * 将预览滚动到指定锚点，缺省时回到顶部
 * @param headingId - 目标标题锚点 ID
 */
function scrollToHeading(headingId) {
    const content = getPreviewContentElement();
    if (!content) {
        return;
    }
    if (!headingId) {
        content.scrollTo({ top: 0, behavior: 'instant' });
        return;
    }

    const element = document.getElementById(headingId);
    if (element) {
        // 仅在预览内容滚动区域内定位标题，避免末项带动 webview 外层滚动
        const targetScrollTop = content.scrollTop + element.getBoundingClientRect().top - content.getBoundingClientRect().top;
        const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight);
        const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
        content.scrollTo({ top: clampedScrollTop, behavior: 'instant' });
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
 * 将当前缩放倍率应用到预览内容和依赖缩放定位的浮层
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
 * 释放上一份预览挂载在内容区之外的浮层和拖拽状态
 * @param content - 当前 Webview 的内容区
 */
function clearPreviewInteractions(content) {
    if (typeof PreviewCommentTooltip !== 'undefined') PreviewCommentTooltip.hideCommentTooltip(true);
    if (typeof PreviewMarkdown !== 'undefined' && PreviewMarkdown.cleanupMarkdownSkeletonOutline) {
        PreviewMarkdown.cleanupMarkdownSkeletonOutline();
    }
    if (typeof PreviewMermaid !== 'undefined') PreviewMermaid.teardownMermaidPan();
    content.classList.remove('is-mermaid-preview');
    if (typeof PreviewTable !== 'undefined') PreviewTable.resetTableDrag();
}

/**
 * 使用公共样式立即显示空状态或错误信息
 * @param content - 当前 Webview 的内容区
 * @param html - 宿主或客户端提供的状态提示
 */
function showStatusContent(content, html) {
    clearPreviewInteractions(content);
    currentFileType = null;
    currentHeadings = [];
    applyCssScopes(null);
    content.classList.remove('is-loading');
    content.style.zoom = '';
    content.replaceChildren(buildSafeContentFragment(html));
}

/**
 * 显示 loading 状态
 * 显示加载状态
 */
function showLoading() {
    const content = document.getElementById('content');
    latestUpdateSequence++;
    clearPreviewInteractions(content);
    currentFileType = null;
    currentHeadings = [];
    content.classList.add('is-loading');
    content.style.zoom = '';
    content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
}
