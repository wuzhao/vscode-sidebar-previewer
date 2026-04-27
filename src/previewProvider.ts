import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MarkdownProvider } from './markdownProvider';
import { getFileType, FileType, HeadingInfo, isDataTreeType, PreviewResult } from './fileTypes';
import { CodePreviewProvider } from './codePreviewProvider';
import { LatexPreviewProvider } from './latexPreviewProvider';
import { MermaidPreviewProvider } from './mermaidPreviewProvider';
import { TablePreviewProvider } from './tablePreviewProvider';
import { i18n } from './i18n';
import { escapeHtml } from './utils';

/**
 * 提供 Preview 相关预览能力
 */
export class PreviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private _view?: vscode.WebviewView;
    private _webviewReady: boolean = false;
    private _previewCssPath: string;
    private _previewCommonJsPath: string;
    private _previewCodeblockJsPath: string;
    private _previewKatexJsPath: string;
    private _previewMermaidJsPath: string;
    private _previewMarkdownJsPath: string;
    private _previewDatatreeJsPath: string;
    private _previewCommentTooltipJsPath: string;
    private _previewTableJsPath: string;
    private _currentHeadings: HeadingInfo[] = [];
    private _currentFileType: FileType | null = null;
    private _supportsLocate: boolean = false;
    private _followEditorScroll: boolean = true;
    private _suppressNextAutoScroll: boolean = false;
    private _visibleRangesListener?: vscode.Disposable;
    private _zoomLevel: number = 100;
    private readonly ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300, 400];
    private _loadingTimeout: ReturnType<typeof setTimeout> | null = null;

    private _codiconCssPath: string;
    private _katexCssPath: string;
    private _katexJsPath: string;
    private _mermaidJsPath: string;

    /**
     * 初始化 PreviewProvider 实例
     * @param _extensionContext - 扩展运行时上下文对象
     */
    constructor(private readonly _extensionContext: vscode.ExtensionContext) {
        const resourcesPath = path.join(_extensionContext.extensionPath, 'resources');
        this._previewCssPath = path.join(resourcesPath, 'preview.css');
        this._previewCommonJsPath = path.join(resourcesPath, 'preview-common.js');
        this._previewCodeblockJsPath = path.join(resourcesPath, 'preview-codeblock.js');
        this._previewKatexJsPath = path.join(resourcesPath, 'preview-katex.js');
        this._previewMermaidJsPath = path.join(resourcesPath, 'preview-mermaid.js');
        this._previewMarkdownJsPath = path.join(resourcesPath, 'preview-markdown.js');
        this._previewDatatreeJsPath = path.join(resourcesPath, 'preview-datatree.js');
        this._previewCommentTooltipJsPath = path.join(resourcesPath, 'preview-comment-tooltip.js');
        this._previewTableJsPath = path.join(resourcesPath, 'preview-table.js');

        const vendorPath = path.join(resourcesPath, 'vendor');

        // 优先使用打包复制到 resources/vendor 的静态资源；开发模式下回退到 node_modules
        this._codiconCssPath = this._resolveAssetPath(
            path.join(vendorPath, 'codicons', 'codicon.css'),
            path.join(_extensionContext.extensionPath, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );

        this._katexCssPath = this._resolveAssetPath(
            path.join(vendorPath, 'katex', 'katex.min.css'),
            path.join(_extensionContext.extensionPath, 'node_modules', 'katex', 'dist', 'katex.min.css')
        );

        this._katexJsPath = this._resolveAssetPath(
            path.join(vendorPath, 'katex', 'katex.min.js'),
            path.join(_extensionContext.extensionPath, 'node_modules', 'katex', 'dist', 'katex.min.js')
        );

        this._mermaidJsPath = this._resolveAssetPath(
            path.join(vendorPath, 'mermaid', 'mermaid.min.js'),
            path.join(_extensionContext.extensionPath, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')
        );
    }

    /**
     * 解析资源路径并返回最终结果
     * @param preferredPath - 优先使用的资源路径
     * @param fallbackPath - 首选资源缺失时的回退路径
     * @returns 返回最终结果
     */
    private _resolveAssetPath(preferredPath: string, fallbackPath: string): string {
        if (fs.existsSync(preferredPath)) {
            return preferredPath;
        }
        if (fs.existsSync(fallbackPath)) {
            return fallbackPath;
        }
        console.warn(`Sidebar Previewer: asset not found, using preferred path fallback. preferred=${preferredPath}, fallback=${fallbackPath}`);
        return fallbackPath;
    }

    /**
     * 处理 resolveWebviewView 相关逻辑
     * @param webviewView - 待初始化的 Webview 视图
     * @param _context - Webview 解析上下文信息
     * @param _token - 取消操作的令牌对象
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        this._updateZoomContext();
        this._updateFollowScrollContext();

        // 构建可访问的本地资源根（包含扩展内资源与工作区根）
        const roots: vscode.Uri[] = [
            vscode.Uri.file(path.dirname(this._previewCssPath)),
            vscode.Uri.file(path.dirname(this._codiconCssPath)),
            vscode.Uri.file(path.dirname(this._katexCssPath)),
            vscode.Uri.file(path.dirname(this._mermaidJsPath))
        ];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const wf of workspaceFolders) {
                roots.push(wf.uri);
            }
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: roots
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        this._webviewReady = false;

        // 监听来自 webview 的消息
        this._extensionContext.subscriptions.push(
            webviewView.webview.onDidReceiveMessage((message) => {
                if (message.type === 'zoomChange') {
                    this._zoomLevel = message.level;
                    vscode.window.setStatusBarMessage(i18n.format(i18n.zoomStatus, String(this._zoomLevel)), 2000);
                    this._updateZoomContext();
                } else if (message.type === 'webviewReady') {
                    this._webviewReady = true;
                    this._refreshPreviewForActiveEditor();
                } else if (message.type === 'visibleHeading') {
                    this._handleLocateEditor(message.headingId);
                } else if (message.type === 'visibleLine') {
                    this._handleLocateEditorFromLine(message.line, message.char);
                } else if (message.type === 'toggleCheckbox') {
                    this._handleToggleCheckbox(message.line, message.checked);
                } else if (message.type === 'navigateToLine') {
                    this._navigateToLine(message.line, message.char);
                } else if (message.type === 'updateEditorSelection') {
                    if (Array.isArray(message.selections)) {
                        this._updateEditorSelection(message.selections);
                    } else {
                        this._updateEditorSelection([{
                            startLine: message.startLine,
                            startChar: message.startChar,
                            endLine: message.endLine,
                            endChar: message.endChar
                        }]);
                    }
                }
            })
        );

        // 监听 webview 可见性变化（当用户点击侧边栏 tab 时触发）
        this._extensionContext.subscriptions.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    this._clearLoadingTimeout();
                    this._updateVisibleRangesListener();
                    this._refreshPreviewForActiveEditor();
                }
            })
        );

        // 监听活动编辑器变化
        this._extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!this._view || !webviewView.visible) {
                    return;
                }
                if (!this._webviewReady) {
                    return;
                }
                this._updateVisibleRangesListener();
                try {
                    if (editor && editor.document) {
                        this._clearLoadingTimeout();
                        this._refreshPreviewForActiveEditor();
                    } else {
                        // 非文本编辑器（如图片），显示空状态；延时处理，避免快速切换编辑器时闪烁
                        this._setLoadingTimeout(() => {
                            this._showEmptyState();
                        }, 800);
                    }
                } catch (error) {
                    console.error('Sidebar Previewer: Error in onDidChangeActiveTextEditor', error);
                }
            })
        );

        // 监听文档变化
        this._extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                try {
                    if (!this._view || !webviewView.visible) {
                        return;
                    }
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document && e.document && e.document === editor.document && this._getSupportedFileType(e.document)) {
                        // 跳过无实际内容变化的事件（如保存时的格式化还原）
                        if (e.contentChanges.length === 0) {
                            return;
                        }
                        const editedLine = e.contentChanges[0].range.start.line;
                        const suppressAutoScroll = this._consumeSuppressNextAutoScroll();
                        this._updatePreview(e.document, editedLine, {
                            suppressAutoScroll,
                            preserveScrollPosition: suppressAutoScroll,
                        });
                    }
                } catch (error) {
                    console.error('Sidebar Previewer: Error in onDidChangeTextDocument', error);
                }
            })
        );

        // 监听选区变化：在数据树预览中高亮当前行或选区对应的键
        this._extensionContext.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (!this._view || !webviewView.visible) {
                    return;
                }
                if (e.textEditor !== vscode.window.activeTextEditor) {
                    return;
                }
                this._postDataTreeSelectionRange(e.textEditor);
            })
        );

        this._refreshPreviewForActiveEditor();
    }

    /**
     * 处理 _setLoadingTimeout 相关逻辑
     * @param callback - 超时触发时执行的回调函数
     * @param delayMs - 隐藏延迟时间（毫秒）
     */
    private _setLoadingTimeout(callback: () => void, delayMs: number): void {
        this._clearLoadingTimeout();
        this._loadingTimeout = setTimeout(() => {
            this._loadingTimeout = null;
            callback();
        }, delayMs);
    }

    /**
     * 清理加载超时计时器，避免脏数据残留
     */
    private _clearLoadingTimeout(): void {
        if (!this._loadingTimeout) {
            return;
        }
        clearTimeout(this._loadingTimeout);
        this._loadingTimeout = null;
    }

    /**
     * 处理活动编辑器预览相关逻辑并返回结果
     */
    private _refreshPreviewForActiveEditor(): void {
        if (!this._view || !this._view.visible || !this._webviewReady) {
            return;
        }
        this._clearLoadingTimeout();
        this._updateVisibleRangesListener();
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !editor.document) {
                this._showEmptyState();
                return;
            }
            const fileType = this._getSupportedFileType(editor.document);
            if (!fileType) {
                this._showEmptyState();
                return;
            }
            this._showLoading();
            this._updatePreview(editor.document);
            this._scrollToEditorPosition(editor);
        } catch (error) {
            console.error('Sidebar Previewer: Error in refresh preview', error);
        }
    }

    /**
     * 更新编辑器可见范围监听器
     */
    private _updateVisibleRangesListener(): void {
        // 移除旧的监听器
        if (this._visibleRangesListener) {
            this._visibleRangesListener.dispose();
            this._visibleRangesListener = undefined;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor && this._supportsLocate && this._followEditorScroll) {
            this._visibleRangesListener = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
                if (e.textEditor === vscode.window.activeTextEditor) {
                    this._handleEditorScroll(e.visibleRanges);
                }
            });
            this._extensionContext.subscriptions.push(this._visibleRangesListener);
        }
    }

    /**
     * 处理编辑器滚动
     * @param visibleRanges - 编辑器当前可见范围
     */
    private _handleEditorScroll(visibleRanges: readonly vscode.Range[]): void {
        if (!this._view || visibleRanges.length === 0) {
            return;
        }

        const startLine = visibleRanges[0].start.line;

        if (this._currentFileType === 'csv' || this._currentFileType === 'tsv') {
            this._view.webview.postMessage({
                type: 'scrollToLine',
                line: startLine
            });
            return;
        }

        const heading = this._findCurrentHeading(startLine);

        if (heading) {
            this._view.webview.postMessage({
                type: 'scrollToHeading',
                headingId: heading.id
            });
        }
    }

    /**
     * 滚动预览到编辑器当前可见位置
     * @param editor - 当前活动编辑器实例
     */
    private _scrollToEditorPosition(editor: vscode.TextEditor): void {
        if (!this._view || !this._supportsLocate || !this._followEditorScroll) {
            return;
        }
        const visibleRanges = editor.visibleRanges;
        if (visibleRanges.length === 0) {
            return;
        }
        const startLine = visibleRanges[0].start.line;

        if (this._currentFileType === 'csv' || this._currentFileType === 'tsv') {
            this._view.webview.postMessage({
                type: 'scrollToLine',
                line: startLine
            });
            return;
        }

        const heading = this._findCurrentHeading(startLine);
        this._view.webview.postMessage({
            type: 'scrollToHeading',
            headingId: heading ? heading.id : null
        });
    }

    /**
     * 查找当前标题并返回匹配结果
     * @param startLine - 起始行号
     * @returns 返回匹配结果
     */
    private _findCurrentHeading(startLine: number): HeadingInfo | null {
        return MarkdownProvider.findCurrentHeading(this._currentHeadings, startLine);
    }

    /**
     * 获取滚动目标标题ID并返回结果
     * @param document - 当前文档对象
     * @returns 返回编辑器当前可见区域对应的标题 ID
     */
    private _getScrollTargetHeadingId(document: vscode.TextDocument): string | null | undefined {
        if (!this._supportsLocate || !this._followEditorScroll) {
            return undefined;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document || editor.visibleRanges.length === 0) {
            return undefined;
        }

        const heading = this._findCurrentHeading(editor.visibleRanges[0].start.line);
        return heading ? heading.id : null;
    }

    /**
     * 获取表格滚动目标行号并返回结果
     * @param document - 当前文档对象
     * @returns 返回编辑器当前可见区域的起始行号
     */
    private _getScrollTargetLine(document: vscode.TextDocument): number | null | undefined {
        if (!this._supportsLocate || !this._followEditorScroll) {
            return undefined;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document || editor.visibleRanges.length === 0) {
            return undefined;
        }

        return editor.visibleRanges[0].start.line;
    }

    /**
     * 显示空状态
     */
    private _showEmptyState(): void {
        this._clearLoadingTimeout();
        this._currentHeadings = [];
        this._currentFileType = null;
        this._supportsLocate = false;
        this._updateVisibleRangesListener();
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.hasPreview', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.supportsLocate', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.isDataTree', false);
        try {
            if (!this._view) {
                return;
            }
            this._view.webview.postMessage({
                type: 'update',
                content: `<div class="empty-state"><i class="codicon codicon-preview empty-icon"></i><div class="empty-text">${i18n.emptyStateText}</div></div>`
            });
        } catch (error) {
            console.error('Sidebar Previewer: Error in _showEmptyState', error);
        }
    }

    /**
     * 显示 loading 状态
     */
    private _showLoading(): void {
        this._clearLoadingTimeout();
        try {
            if (!this._view) {
                return;
            }
            this._view.webview.postMessage({ type: 'loading' });
        } catch (error) {
            // 忽略 loading 消息发送异常，避免影响后续刷新流程
        }
    }

    /**
     * 获取文档的支持文件类型，不支持则返回 null
     * @param document - 当前文档对象
     * @returns 返回null
     */
    private _getSupportedFileType(document: vscode.TextDocument | undefined): FileType | null {
        if (!document || !document.fileName) {
            return null;
        }
        // 优先通过 languageId 检测 markdown
        if (document.languageId === 'markdown') {
            return 'markdown';
        }
        if (document.languageId === 'jsonc') {
            return 'json';
        }
        return getFileType(document.fileName);
    }

    /**
     * 更新预览内容
     * @param document - 当前文档对象
     * @param editedLine - 触发更新的编辑行号
     * @param options - 预览更新附加选项
     */
    private _updatePreview(
        document: vscode.TextDocument,
        editedLine?: number,
        options?: { suppressAutoScroll?: boolean; preserveScrollPosition?: boolean }
    ): void {
        try {
            this._clearLoadingTimeout();
            if (!this._view) {
                return;
            }

            const fileType = this._getSupportedFileType(document);
            if (!fileType) {
                this._showEmptyState();
                return;
            }

            this._currentFileType = fileType;
            const content = document.getText();
            let result: PreviewResult;

            switch (fileType) {
                case 'markdown': {
                    const { html, headings } = MarkdownProvider.parse(content);
                    this._currentHeadings = headings;
                    result = {
                        html,
                        fileType: 'markdown',
                        supportsLocate: true,
                        headings,
                    };
                    break;
                }
                case 'latex':
                    result = LatexPreviewProvider.parse(content);
                    this._currentHeadings = result.headings || [];
                    break;
                case 'mermaid':
                    result = MermaidPreviewProvider.parse(content);
                    this._currentHeadings = [];
                    break;
                case 'json':
                case 'yaml':
                case 'toml':
                case 'xml':
                    result = CodePreviewProvider.parse(content, fileType);
                    this._currentHeadings = [];
                    break;
                case 'csv':
                case 'tsv':
                    result = TablePreviewProvider.parse(content, fileType);
                    this._currentHeadings = [];
                    break;
                default:
                    this._showEmptyState();
                    return;
            }

            const locateSupported = result.supportsLocate;
            this._supportsLocate = locateSupported;
            const dataTree = isDataTreeType(fileType);
            this._updateVisibleRangesListener();

            vscode.commands.executeCommand('setContext', 'sidebarPreviewer.hasPreview', true);
            vscode.commands.executeCommand('setContext', 'sidebarPreviewer.supportsLocate', locateSupported);
            vscode.commands.executeCommand('setContext', 'sidebarPreviewer.isDataTree', dataTree);

            const isTableType = fileType === 'csv' || fileType === 'tsv';
            const scrollTargetHeadingId = options?.suppressAutoScroll ? undefined
                : isTableType ? undefined
                : this._getScrollTargetHeadingId(document);
            const scrollTargetLine = options?.suppressAutoScroll ? undefined
                : isTableType ? this._getScrollTargetLine(document)
                : undefined;
            const selectionRange = (dataTree || isTableType) ? this._getEditorSelectionRange(document) : null;
            const message: {
                type: 'update';
                content: string;
                headings: HeadingInfo[];
                fileType: FileType;
                clientRender: PreviewResult['clientRender'] | null;
                selectionStartLine: number | null;
                selectionEndLine: number | null;
                selectionStartChar: number | null;
                selectionEndChar: number | null;
                editedLine: number | null;
                preserveScrollPosition: boolean;
                scrollToHeadingId?: string | null;
                scrollToLine?: number | null;
                baseUri?: string | null;
            } = {
                type: 'update',
                content: result.html,
                headings: result.headings || [],
                fileType: result.fileType,
                clientRender: result.clientRender || null,
                selectionStartLine: selectionRange ? selectionRange.startLine : null,
                selectionEndLine: selectionRange ? selectionRange.endLine : null,
                selectionStartChar: selectionRange ? selectionRange.startChar : null,
                selectionEndChar: selectionRange ? selectionRange.endChar : null,
                editedLine: editedLine !== undefined ? editedLine : null,
                preserveScrollPosition: options?.preserveScrollPosition === true,
            };

            if (scrollTargetHeadingId !== undefined) {
                message.scrollToHeadingId = scrollTargetHeadingId;
            }
            if (scrollTargetLine !== undefined) {
                message.scrollToLine = scrollTargetLine;
            }

            // 把当前文档所在目录转为 webview 可访问的 baseUri，前端会用它设置 <base>
            try {
                const docDir = path.dirname(document.uri.fsPath || '');
                if (docDir && this._view) {
                    const base = this._view.webview.asWebviewUri(vscode.Uri.file(docDir)).toString();
                    message.baseUri = base.endsWith('/') ? base : base + '/';
                }
            } catch (_e) {
                // 忽略 baseUri 构造异常，前端仍可渲染绝对路径内容
            }

            this._view.webview.postMessage(message);
        } catch (error) {
            console.error('Sidebar Previewer: Error in _updatePreview', error);
            this._showError(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * 获取编辑器选区范围并返回结果
     * @param document - 当前文档对象
     * @returns 返回编辑器当前选区的行范围
     */
    private _getEditorSelectionRange(document: vscode.TextDocument): { startLine: number; endLine: number; startChar: number; endChar: number } | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document || editor.selections.length === 0) {
            return null;
        }

        const selection = editor.selections[0];
        let startLine = selection.start.line;
        let startChar = selection.start.character;
        let endLine = selection.end.line;
        let endChar = selection.end.character;

        if (startLine > endLine || (startLine === endLine && startChar > endChar)) {
            startLine = selection.end.line;
            startChar = selection.end.character;
            endLine = selection.start.line;
            endChar = selection.start.character;
        }

        return { startLine, endLine, startChar, endChar };
    }

    /**
     * 处理数据树选区范围相关逻辑并返回结果
     * @param editor - 当前活动编辑器实例
     */
    private _postDataTreeSelectionRange(editor: vscode.TextEditor | undefined): void {
        if (!this._view || !editor) {
            return;
        }

        const fileType = this._getSupportedFileType(editor.document);
        if (!fileType) {
            return;
        }

        if (isDataTreeType(fileType)) {
            const selectionRange = this._getEditorSelectionRange(editor.document);
            this._view.webview.postMessage({
                type: 'highlightDataTreeRange',
                startLine: selectionRange ? selectionRange.startLine : null,
                endLine: selectionRange ? selectionRange.endLine : null,
            });
        } else if (fileType === 'csv' || fileType === 'tsv') {
            const selectionRange = this._getEditorSelectionRange(editor.document);
            this._view.webview.postMessage({
                type: 'highlightTableRange',
                startLine: selectionRange ? selectionRange.startLine : null,
                startChar: selectionRange ? selectionRange.startChar : null,
                endLine: selectionRange ? selectionRange.endLine : null,
                endChar: selectionRange ? selectionRange.endChar : null,
            });
        }
    }

    /**
     * 显示错误状态
     * @param message - 错误或提示信息
     */
    private _showError(message: string): void {
        this._clearLoadingTimeout();
        this._supportsLocate = false;
        this._updateVisibleRangesListener();
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.hasPreview', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.supportsLocate', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.isDataTree', false);
        try {
            if (!this._view) {
                return;
            }
            const errorHtml = `<div class="error-state"><i class="codicon codicon-search-stop error-icon"></i><div class="error-text">${i18n.previewError}</div><pre class="error-detail">${escapeHtml(message)}</pre></div>`;
            this._view.webview.postMessage({
                type: 'update',
                content: errorHtml,
            });
        } catch (err) {
            console.error('Sidebar Previewer: Error in _showError', err);
        }
    }

    /**
     * 滚动到指定标题
     * @param headingId - 目标标题锚点 ID
     */
    public scrollToHeading(headingId: string): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'scrollToHeading',
                headingId: headingId
            });
        }
    }

    /**
     * 放大
     */
    public zoomIn(): void {
        const nextStep = this.ZOOM_STEPS.find(step => step > this._zoomLevel);
        if (nextStep !== undefined) {
            this._zoomLevel = nextStep;
            this._applyZoom();
        }
    }

    /**
     * 缩小
     */
    public zoomOut(): void {
        const reverseSteps = [...this.ZOOM_STEPS].reverse();
        const nextStep = reverseSteps.find(step => step < this._zoomLevel);
        if (nextStep !== undefined) {
            this._zoomLevel = nextStep;
            this._applyZoom();
        }
    }

    /**
     * 重置缩放
     */
    public zoomReset(): void {
        this._zoomLevel = 100;
        this._applyZoom();
    }

    /**
     * 预览定位：将预览滚动到编辑器当前可见区域对应的位置
     */
    public locatePreview(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this._view || !this._supportsLocate) {
            return;
        }

        const visibleRanges = editor.visibleRanges;
        if (visibleRanges.length === 0) {
            return;
        }

        const startLine = visibleRanges[0].start.line;

        if (this._currentFileType === 'csv' || this._currentFileType === 'tsv') {
            this._view.webview.postMessage({
                type: 'scrollToLine',
                line: startLine
            });
            return;
        }

        const heading = this._findCurrentHeading(startLine);

        this._view.webview.postMessage({
            type: 'scrollToHeading',
            headingId: heading ? heading.id : null
        });
    }

    /**
     * 编辑定位：请求 webview 报告当前可见标题，然后滚动编辑器（不触发预览滚动）
     */
    public locateEditor(): void {
        if (!this._view || !this._supportsLocate) {
            return;
        }
        // 暂时移除 visibleRanges 监听器，避免编辑器滚动后又触发预览滚动
        if (this._visibleRangesListener) {
            this._visibleRangesListener.dispose();
            this._visibleRangesListener = undefined;
        }
        if (this._currentFileType === 'csv' || this._currentFileType === 'tsv') {
            this._view.webview.postMessage({
                type: 'getVisibleLine'
            });
            return;
        }
        this._view.webview.postMessage({
            type: 'getVisibleHeading'
        });
    }

    /**
     * 处理跟随滚动相关逻辑并返回结果
     */
    public enableFollowScroll(): void {
        this._setFollowEditorScroll(true);
    }

    /**
     * 处理跟随滚动相关逻辑并返回结果
     */
    public disableFollowScroll(): void {
        this._setFollowEditorScroll(false);
    }

    /**
     * 展开所有树形节点
     */
    public expandAll(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'expandAll' });
        }
    }

    /**
     * 折叠所有树形节点
     */
    public collapseAll(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'collapseAll' });
        }
    }

    /**
     * 导航到源文件指定行
     * @param line - 当前处理的行内容或行号
     */
    private _navigateToLine(line: number, char?: number): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || line < 0) {
            return;
        }
        const charPos = typeof char === 'number' && char >= 0 ? char : 0;
        // 先将目标行滚动到编辑器可见区域上方约 1/5 处
        const visibleRanges = editor.visibleRanges;
        if (visibleRanges.length > 0) {
            const visibleLines = visibleRanges[0].end.line - visibleRanges[0].start.line;
            const offset = Math.floor(visibleLines / 5);
            const topLine = Math.max(0, line - offset);
            editor.revealRange(
                new vscode.Range(topLine, 0, topLine, 0),
                vscode.TextEditorRevealType.AtTop
            );
        } else {
            editor.revealRange(
                new vscode.Range(line, 0, line, 0),
                vscode.TextEditorRevealType.InCenter
            );
        }
        editor.selection = new vscode.Selection(line, charPos, line, charPos);
    }

    /**
     * 更新编辑器选区
     * @param selections - 选区范围数组
     */
    private _updateEditorSelection(selections: { startLine: number; startChar: number; endLine: number; endChar: number }[]): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !selections || selections.length === 0) {
            return;
        }

        const vsSelections = selections.map(s => new vscode.Selection(
            new vscode.Position(s.startLine, s.startChar),
            new vscode.Position(s.endLine, s.endChar)
        ));

        editor.selections = vsSelections;

        // 滚动到最后一个选区（通常是鼠标拖拽的目标位置）
        const last = selections[selections.length - 1];
        const range = new vscode.Range(
            new vscode.Position(last.startLine, last.startChar),
            new vscode.Position(last.endLine, last.endChar)
        );
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    /**
     * 处理编辑定位响应
     * @param headingId - 目标标题锚点 ID
     */
    private _handleLocateEditor(headingId: string | null): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this._supportsLocate) {
            return;
        }

        let line = 0;
        if (headingId) {
            const heading = this._currentHeadings.find(h => h.id === headingId);
            if (heading) {
                line = heading.line;
            }
        }

        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
        editor.selection = new vscode.Selection(line, 0, line, 0);

        // 延迟恢复 visibleRanges 监听器，等编辑器滚动完毕
        setTimeout(() => {
            this._updateVisibleRangesListener();
        }, 500);
    }

    /**
     * 处理表格可见行编辑定位响应
     * @param line - 目标行号
     * @param char - 目标字符位置
     */
    private _handleLocateEditorFromLine(line: number | undefined, char?: number): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this._supportsLocate) {
            return;
        }
        const targetLine = typeof line === 'number' && line >= 0 ? line : 0;
        const targetChar = typeof char === 'number' && char >= 0 ? char : 0;

        const range = new vscode.Range(targetLine, 0, targetLine, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
        editor.selection = new vscode.Selection(targetLine, targetChar, targetLine, targetChar);

        setTimeout(() => {
            this._updateVisibleRangesListener();
        }, 500);
    }

    /**
     * 处理 checkbox 切换
     * @param line - 当前处理的行内容或行号
     * @param checked - 复选框目标状态
     */
    private async _handleToggleCheckbox(line: number, checked: boolean): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || this._currentFileType !== 'markdown') {
            return;
        }

        const document = editor.document;
        if (line < 0 || line >= document.lineCount) {
            return;
        }
        const lineText = document.lineAt(line).text;

        let newText: string;
        if (checked) {
            newText = lineText.replace(/\[ \]/, '[x]');
        } else {
            newText = lineText.replace(/\[[xX]\]/, '[ ]');
        }

        if (newText !== lineText) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), newText);
            this._suppressNextAutoScroll = true;
            const applied = await vscode.workspace.applyEdit(edit);
            if (!applied) {
                this._suppressNextAutoScroll = false;
            }
        }
    }

    /**
     * 处理下一次自动滚动抑制状态相关逻辑并返回结果
     * @returns 返回并清除自动滚动抑制状态
     */
    private _consumeSuppressNextAutoScroll(): boolean {
        const suppress = this._suppressNextAutoScroll;
        this._suppressNextAutoScroll = false;
        return suppress;
    }

    /**
     * 设置编辑器滚动跟随并保持一致性
     * @param enabled - 是否启用跟随滚动
     */
    private _setFollowEditorScroll(enabled: boolean): void {
        if (this._followEditorScroll === enabled) {
            return;
        }

        this._followEditorScroll = enabled;
        this._updateFollowScrollContext();
        this._updateVisibleRangesListener();

        if (enabled && this._view?.visible && this._supportsLocate) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                this._scrollToEditorPosition(editor);
            }
        }
    }

    /**
     * 更新跟随滚动上下文并同步相关结果
     */
    private _updateFollowScrollContext(): void {
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.followScrollEnabled', this._followEditorScroll);
    }

    /**
     * 更新缩放相关的上下文
     */
    private _updateZoomContext(): void {
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomOut', this._zoomLevel > this.ZOOM_STEPS[0]);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomIn', this._zoomLevel < this.ZOOM_STEPS[this.ZOOM_STEPS.length - 1]);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomReset', this._zoomLevel !== 100);
    }

    /**
     * 应用缩放
     */
    private _applyZoom(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'zoom',
                level: this._zoomLevel
            });
            // 显示缩放比例提示
            vscode.window.setStatusBarMessage(i18n.format(i18n.zoomStatus, String(this._zoomLevel)), 2000);
            this._updateZoomContext();
        }
    }

    /**
     * 生成 WebView HTML 内容
     * @param webview - 目标 Webview 实例
     * @returns 返回 Webview 页面 HTML 模板
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const previewCssUri = webview.asWebviewUri(vscode.Uri.file(this._previewCssPath));
        const previewCommonJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewCommonJsPath));
        const previewCodeblockJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewCodeblockJsPath));
        const previewKatexJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewKatexJsPath));
        const previewMermaidJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewMermaidJsPath));
        const previewMarkdownJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewMarkdownJsPath));
        const previewDatatreeJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewDatatreeJsPath));
        const previewCommentTooltipJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewCommentTooltipJsPath));
        const previewTableJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewTableJsPath));
        const codiconUri = webview.asWebviewUri(vscode.Uri.file(this._codiconCssPath));
        const katexCssUri = webview.asWebviewUri(vscode.Uri.file(this._katexCssPath));
        const katexJsUri = webview.asWebviewUri(vscode.Uri.file(this._katexJsPath));
        const mermaidJsUri = webview.asWebviewUri(vscode.Uri.file(this._mermaidJsPath));
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-eval'; img-src ${cspSource} https: http: data: blob:; font-src ${cspSource};">
    <title>${i18n.webviewTitle}</title>
    <link rel="stylesheet" href="${codiconUri}">
    <link rel="stylesheet" href="${katexCssUri}">
    <link rel="stylesheet" href="${previewCssUri}">
</head>
<body data-copy-success="${escapeHtml(i18n.copySuccess)}" data-copy-code="${escapeHtml(i18n.copyCode)}" data-view-code="${escapeHtml(i18n.viewCode)}" data-view-preview="${escapeHtml(i18n.viewPreview)}" data-table-selection-more="${escapeHtml(i18n.tableSelectionMore)}" data-table-selection-ascii="${escapeHtml(i18n.tableSelectionAsciiTable)}" data-table-selection-tsv="${escapeHtml(i18n.tableSelectionTsv)}">
    <div id="sidebar-previewer-container">
        <div class="content" id="content">
            <div class="loading-state"><div class="loading-spinner"></div></div>
        </div>
    </div>
    <script src="${katexJsUri}"></script>
    <script src="${mermaidJsUri}"></script>
    <script src="${previewCommonJsUri}"></script>
    <script src="${previewCodeblockJsUri}"></script>
    <script src="${previewKatexJsUri}"></script>
    <script src="${previewMermaidJsUri}"></script>
    <script src="${previewMarkdownJsUri}"></script>
    <script src="${previewCommentTooltipJsUri}"></script>
    <script src="${previewDatatreeJsUri}"></script>
    <script src="${previewTableJsUri}"></script>
</body>
</html>`;
    }

    /**
     * 处理当前场景相关逻辑并返回结果
     */
    public dispose(): void {
        this._clearLoadingTimeout();
        if (this._visibleRangesListener) {
            this._visibleRangesListener.dispose();
            this._visibleRangesListener = undefined;
        }
        this._view = undefined;
        this._webviewReady = false;
    }
}
