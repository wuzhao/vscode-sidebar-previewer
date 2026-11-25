import { FileType, getDataTreeFileTypes } from './fileTypes';

// 预览缩放使用的统一步进
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300, 400] as const;
// 文档进入解析器前允许的最大 UTF-8 字节数
export const MAX_PREVIEW_INPUT_BYTES = 5 * 1024 * 1024;
// 单次预览允许生成的最大 HTML 字符数
export const MAX_RENDERED_HTML_LENGTH = 10 * 1024 * 1024;
// CSV 与 TSV 首段最多渲染的正文行数
export const MAX_RENDERED_TABLE_ROWS = 2000;
// 数据树首段最多渲染的键或数组节点数
export const MAX_RENDERED_TREE_NODES = 4000;
// 连续编辑触发预览刷新的防抖时间
export const PREVIEW_UPDATE_DEBOUNCE_MS = 150;

// 扩展宿主发送给 Webview 的消息类型
export const EXTENSION_TO_WEBVIEW_MESSAGE_TYPES = {
    update: 'update',
    loading: 'loading',
    scrollToHeading: 'scrollToHeading',
    getVisibleHeading: 'getVisibleHeading',
    scrollToLine: 'scrollToLine',
    getVisibleLine: 'getVisibleLine',
    zoom: 'zoom',
    expandAll: 'expandAll',
    collapseAll: 'collapseAll',
    highlightDataTreeRange: 'highlightDataTreeRange',
    highlightTableRange: 'highlightTableRange',
    getHighlightedDataTreeLocator: 'getHighlightedDataTreeLocator',
} as const;

// Webview 回传给扩展宿主的消息类型
export const WEBVIEW_TO_EXTENSION_MESSAGE_TYPES = {
    zoomChange: 'zoomChange',
    webviewReady: 'webviewReady',
    mermaidRenderFailed: 'mermaidRenderFailed',
    visibleHeading: 'visibleHeading',
    visibleLine: 'visibleLine',
    toggleCheckbox: 'toggleCheckbox',
    navigateToLine: 'navigateToLine',
    updateEditorSelection: 'updateEditorSelection',
    dataTreeHighlightState: 'dataTreeHighlightState',
    dataTreeLocator: 'dataTreeLocator',
} as const;

/**
 * 注入 Webview 的共享运行时配置
 */
export interface WebviewRuntimeConfig {
    zoomSteps: readonly number[];
    dataTreeFileTypes: FileType[];
    extensionToWebviewMessageTypes: typeof EXTENSION_TO_WEBVIEW_MESSAGE_TYPES;
    webviewToExtensionMessageTypes: typeof WEBVIEW_TO_EXTENSION_MESSAGE_TYPES;
}

/**
 * 构建宿主端与 Webview 共用的运行时配置
 * @returns 返回可序列化到 HTML data 属性的配置对象
 */
export function createWebviewRuntimeConfig(): WebviewRuntimeConfig {
    return {
        zoomSteps: ZOOM_STEPS,
        dataTreeFileTypes: getDataTreeFileTypes(),
        extensionToWebviewMessageTypes: EXTENSION_TO_WEBVIEW_MESSAGE_TYPES,
        webviewToExtensionMessageTypes: WEBVIEW_TO_EXTENSION_MESSAGE_TYPES,
    };
}
