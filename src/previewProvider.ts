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
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
export class PreviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private _view?: vscode.WebviewView;
    private _webviewReady: boolean = false;
    private _previewCssPath: string;
    private _previewJsPath: string;
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
     * @param _extensionContext - _extensionContext 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    constructor(private readonly _extensionContext: vscode.ExtensionContext) {
        const resourcesPath = path.join(_extensionContext.extensionPath, 'resources');
        this._previewCssPath = path.join(resourcesPath, 'preview.css');
        this._previewJsPath = path.join(resourcesPath, 'preview.js');

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
     * @param preferredPath - preferredPath 参数
     * @param fallbackPath - fallbackPath 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
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
     * @param webviewView - 参数
     * @param _context - 参数
     * @param _token - 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
                } else if (message.type === 'toggleCheckbox') {
                    this._handleToggleCheckbox(message.line, message.checked);
                } else if (message.type === 'navigateToLine') {
                    this._navigateToLine(message.line);
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
     * @param callback - 参数
     * @param delayMs - 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param visibleRanges - visibleRanges 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private _handleEditorScroll(visibleRanges: readonly vscode.Range[]): void {
        if (!this._view || visibleRanges.length === 0) {
            return;
        }

        const startLine = visibleRanges[0].start.line;
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
     * @param editor - editor 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
        const heading = this._findCurrentHeading(startLine);
        this._view.webview.postMessage({
            type: 'scrollToHeading',
            headingId: heading ? heading.id : null
        });
    }

    /**
     * 查找当前标题并返回匹配结果
     * @param startLine - startLine 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private _findCurrentHeading(startLine: number): HeadingInfo | null {
        return MarkdownProvider.findCurrentHeading(this._currentHeadings, startLine);
    }

    /**
     * 获取滚动目标标题ID并返回结果
     * @param document - document 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
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
     * 显示空状态
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param document - document 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
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
     * @param document - document 参数
     * @param editedLine - editedLine 参数
     * @param options - options 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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

            const scrollTargetHeadingId = options?.suppressAutoScroll ? undefined : this._getScrollTargetHeadingId(document);
            const selectionRange = dataTree ? this._getEditorSelectionRange(document) : null;
            const message: {
                type: 'update';
                content: string;
                headings: HeadingInfo[];
                fileType: FileType;
                clientRender: PreviewResult['clientRender'] | null;
                selectionStartLine: number | null;
                selectionEndLine: number | null;
                editedLine: number | null;
                preserveScrollPosition: boolean;
                scrollToHeadingId?: string | null;
                baseUri?: string | null;
            } = {
                type: 'update',
                content: result.html,
                headings: result.headings || [],
                fileType: result.fileType,
                clientRender: result.clientRender || null,
                selectionStartLine: selectionRange ? selectionRange.startLine : null,
                selectionEndLine: selectionRange ? selectionRange.endLine : null,
                editedLine: editedLine !== undefined ? editedLine : null,
                preserveScrollPosition: options?.preserveScrollPosition === true,
            };

            if (scrollTargetHeadingId !== undefined) {
                message.scrollToHeadingId = scrollTargetHeadingId;
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
     * @param document - document 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private _getEditorSelectionRange(document: vscode.TextDocument): { startLine: number; endLine: number } | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document || editor.selections.length === 0) {
            return null;
        }

        const selection = editor.selections[0];
        const startLine = Math.min(selection.start.line, selection.end.line);
        const endLine = Math.max(selection.start.line, selection.end.line);
        return { startLine, endLine };
    }

    /**
     * 处理数据树选区范围相关逻辑并返回结果
     * @param editor - editor 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private _postDataTreeSelectionRange(editor: vscode.TextEditor | undefined): void {
        if (!this._view || !editor) {
            return;
        }

        const fileType = this._getSupportedFileType(editor.document);
        if (!fileType || !isDataTreeType(fileType)) {
            return;
        }

        const selectionRange = this._getEditorSelectionRange(editor.document);
        this._view.webview.postMessage({
            type: 'highlightDataTreeRange',
            startLine: selectionRange ? selectionRange.startLine : null,
            endLine: selectionRange ? selectionRange.endLine : null,
        });
    }

    /**
     * 显示错误状态
     * @param message - message 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param headingId - headingId 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    public zoomReset(): void {
        this._zoomLevel = 100;
        this._applyZoom();
    }

    /**
     * 预览定位：将预览滚动到编辑器当前可见区域对应的位置
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
        const heading = this._findCurrentHeading(startLine);

        this._view.webview.postMessage({
            type: 'scrollToHeading',
            headingId: heading ? heading.id : null
        });
    }

    /**
     * 编辑定位：请求 webview 报告当前可见标题，然后滚动编辑器（不触发预览滚动）
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
        this._view.webview.postMessage({
            type: 'getVisibleHeading'
        });
    }

    /**
     * 处理跟随滚动相关逻辑并返回结果
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    public enableFollowScroll(): void {
        this._setFollowEditorScroll(true);
    }

    /**
     * 处理跟随滚动相关逻辑并返回结果
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    public disableFollowScroll(): void {
        this._setFollowEditorScroll(false);
    }

    /**
     * 展开所有树形节点
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    public expandAll(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'expandAll' });
        }
    }

    /**
     * 折叠所有树形节点
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    public collapseAll(): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'collapseAll' });
        }
    }

    /**
     * 导航到源文件指定行
     * @param line - line 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private _navigateToLine(line: number): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || line < 0) {
            return;
        }
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
        editor.selection = new vscode.Selection(line, 0, line, 0);
    }

    /**
     * 处理编辑定位响应
     * @param headingId - headingId 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * 处理 checkbox 切换
     * @param line - line 参数
     * @param checked - checked 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private _consumeSuppressNextAutoScroll(): boolean {
        const suppress = this._suppressNextAutoScroll;
        this._suppressNextAutoScroll = false;
        return suppress;
    }

    /**
     * 设置编辑器滚动跟随并保持一致性
     * @param enabled - enabled 参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private _updateFollowScrollContext(): void {
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.followScrollEnabled', this._followEditorScroll);
    }

    /**
     * 更新缩放相关的上下文
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
     */
    private _updateZoomContext(): void {
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomOut', this._zoomLevel > this.ZOOM_STEPS[0]);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomIn', this._zoomLevel < this.ZOOM_STEPS[this.ZOOM_STEPS.length - 1]);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.canZoomReset', this._zoomLevel !== 100);
    }

    /**
     * 应用缩放
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
     * @param webview - webview 参数
     * @returns 返回处理结果
     * @throws {Error} 处理失败时抛出异常
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const previewCssUri = webview.asWebviewUri(vscode.Uri.file(this._previewCssPath));
        const previewJsUri = webview.asWebviewUri(vscode.Uri.file(this._previewJsPath));
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
<body data-copy-success="${escapeHtml(i18n.copySuccess)}" data-copy-code="${escapeHtml(i18n.copyCode)}" data-view-code="${escapeHtml(i18n.viewCode)}" data-view-preview="${escapeHtml(i18n.viewPreview)}">
    <div id="sidebar-previewer-container">
        <div class="content" id="content">
            <div class="loading-state"><div class="loading-spinner"></div></div>
        </div>
    </div>
    <script src="${katexJsUri}"></script>
    <script src="${mermaidJsUri}"></script>
    <script src="${previewJsUri}"></script>
</body>
</html>`;
    }

    /**
     * 处理当前场景相关逻辑并返回结果
     * @param input - 无输入参数
     * @returns 无返回值
     * @throws {Error} 处理失败时抛出异常
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
