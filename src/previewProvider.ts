import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownProvider } from './markdownProvider';
import { getFileType, FileType, HeadingInfo, isDataTreeType, PreviewResult } from './fileTypes';
import { CodePreviewProvider } from './codePreviewProvider';
import { LatexPreviewProvider } from './latexPreviewProvider';
import { MermaidPreviewProvider } from './mermaidPreviewProvider';
import { i18n } from './i18n';

export class PreviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
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

    private _codiconCssPath: string;
    private _katexCssPath: string;
    private _katexJsPath: string;
    private _mermaidJsPath: string;

    constructor(private readonly _extensionContext: vscode.ExtensionContext) {
        const resourcesPath = path.join(_extensionContext.extensionPath, 'resources');
        this._previewCssPath = path.join(resourcesPath, 'preview.css');
        this._previewJsPath = path.join(resourcesPath, 'preview.js');
        // codicon CSS 路径
        this._codiconCssPath = path.join(_extensionContext.extensionPath, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
        // KaTeX 路径
        this._katexCssPath = path.join(_extensionContext.extensionPath, 'node_modules', 'katex', 'dist', 'katex.min.css');
        this._katexJsPath = path.join(_extensionContext.extensionPath, 'node_modules', 'katex', 'dist', 'katex.min.js');
        // Mermaid 路径
        this._mermaidJsPath = path.join(_extensionContext.extensionPath, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        this._updateZoomContext();
        this._updateFollowScrollContext();

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.dirname(this._previewCssPath)),
                vscode.Uri.file(path.dirname(this._codiconCssPath)),
                vscode.Uri.file(path.dirname(this._katexCssPath)),
                vscode.Uri.file(path.dirname(this._mermaidJsPath))
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自 webview 的消息
        this._extensionContext.subscriptions.push(
            webviewView.webview.onDidReceiveMessage((message) => {
                if (message.type === 'zoomChange') {
                    this._zoomLevel = message.level;
                    vscode.window.setStatusBarMessage(i18n.format(i18n.zoomStatus, String(this._zoomLevel)), 2000);
                    this._updateZoomContext();
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
                    this._updateVisibleRangesListener();
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document) {
                        this._showLoading();
                        if(this._getSupportedFileType(editor.document)) {
                            this._updatePreview(editor.document);
                            this._scrollToEditorPosition(editor);
                        } else {
                            this._showEmptyState();
                        }
                    } else {
                        this._showEmptyState();
                    }
                }
            })
        );
        let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
        // 监听活动编辑器变化
        this._extensionContext.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!this._view || !webviewView.visible) {
                    return;
                }
                this._updateVisibleRangesListener();
                try {
                    if (editor && editor.document) {
                        this._showLoading();
                        if(this._getSupportedFileType(editor.document)) {
                            if (loadingTimeout) {
                                clearTimeout(loadingTimeout);
                                loadingTimeout = null;
                            }
                            this._updatePreview(editor.document);
                        } else {
                            this._showEmptyState();
                        }
                    } else {
                        // 非文本编辑器（如图片），显示空状态；延时处理，避免快速切换编辑器时闪烁
                        loadingTimeout = setTimeout (() => {
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

        // 初始化预览（延迟执行确保 webview 已准备好）
        setTimeout(() => {
            this._updateVisibleRangesListener();
            try {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document) {
                    this._showLoading();
                    if (this._getSupportedFileType(editor.document)) {
                        this._updatePreview(editor.document);
                        this._scrollToEditorPosition(editor);
                    } else {
                        this._showEmptyState();
                    }
                } else {
                    this._showEmptyState();
                }
            } catch (error) {
                console.error('Sidebar Previewer: Error in initial check', error);
            }
        }, 100);
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

    private _findCurrentHeading(startLine: number): HeadingInfo | null {
        return MarkdownProvider.findCurrentHeading(this._currentHeadings, startLine);
    }

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
     */
    private _showEmptyState(): void {
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
        try {
            if (!this._view) {
                return;
            }
            this._view.webview.postMessage({ type: 'loading' });
        } catch (error) {
            // ignore
        }
    }

    /**
     * 获取文档的支持文件类型，不支持则返回 null
     */
    private _getSupportedFileType(document: vscode.TextDocument | undefined): FileType | null {
        if (!document || !document.fileName) {
            return null;
        }
        // 优先通过 languageId 检测 markdown
        if (document.languageId === 'markdown') {
            return 'markdown';
        }
        return getFileType(document.fileName);
    }

    /**
     * 更新预览内容
     */
    private _updatePreview(
        document: vscode.TextDocument,
        editedLine?: number,
        options?: { suppressAutoScroll?: boolean; preserveScrollPosition?: boolean }
    ): void {
        try {
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
                    result = CodePreviewProvider.parse(content, fileType);
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
            const message: {
                type: 'update';
                content: string;
                headings: HeadingInfo[];
                fileType: FileType;
                clientRender: PreviewResult['clientRender'] | null;
                editedLine: number | null;
                preserveScrollPosition: boolean;
                scrollToHeadingId?: string | null;
            } = {
                type: 'update',
                content: result.html,
                headings: result.headings || [],
                fileType: result.fileType,
                clientRender: result.clientRender || null,
                editedLine: editedLine !== undefined ? editedLine : null,
                preserveScrollPosition: options?.preserveScrollPosition === true,
            };

            if (scrollTargetHeadingId !== undefined) {
                message.scrollToHeadingId = scrollTargetHeadingId;
            }

            this._view.webview.postMessage(message);
        } catch (error) {
            console.error('Sidebar Previewer: Error in _updatePreview', error);
            this._showError(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * 显示错误状态
     */
    private _showError(message: string): void {
        this._supportsLocate = false;
        this._updateVisibleRangesListener();
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.hasPreview', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.supportsLocate', false);
        vscode.commands.executeCommand('setContext', 'sidebarPreviewer.isDataTree', false);
        try {
            if (!this._view) {
                return;
            }
            const errorHtml = `<div class="error-state"><i class="codicon codicon-search-stop error-icon"></i><div class="error-text">${i18n.previewError}</div><pre class="error-detail">${this._escapeHtml(message)}</pre></div>`;
            this._view.webview.postMessage({
                type: 'update',
                content: errorHtml,
            });
        } catch (err) {
            console.error('Sidebar Previewer: Error in _showError', err);
        }
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 滚动到指定标题
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
        this._view.webview.postMessage({
            type: 'getVisibleHeading'
        });
    }

    public enableFollowScroll(): void {
        this._setFollowEditorScroll(true);
    }

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

    private _consumeSuppressNextAutoScroll(): boolean {
        const suppress = this._suppressNextAutoScroll;
        this._suppressNextAutoScroll = false;
        return suppress;
    }

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
<body data-copy-success="${this._escapeHtml(i18n.copySuccess)}" data-copy-code="${this._escapeHtml(i18n.copyCode)}" data-view-code="${this._escapeHtml(i18n.viewCode)}" data-view-preview="${this._escapeHtml(i18n.viewPreview)}">
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
}