import * as vscode from 'vscode';
import { PreviewProvider } from './previewProvider';
import { initI18n } from './i18n';

/**
 * 激活扩展并注册侧边栏预览视图与用户命令
 * @param context - 管理扩展级订阅与持久状态的 VS Code 上下文
 */
export function activate(context: vscode.ExtensionContext) {
    // 初始化国际化
    initI18n(vscode.env.language);
    const feedbackIssuesUrl = vscode.Uri.parse('https://github.com/wuzhao/vscode-sidebar-previewer/issues/new');
    const previewProvider = new PreviewProvider(context);

    context.subscriptions.push(previewProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'sidebar-previewer',
            previewProvider
        )
    );

    const commandHandlers: Array<[string, () => void | Thenable<unknown>]> = [
        ['sidebarPreviewer.zoomIn', () => previewProvider.zoomIn()],
        ['sidebarPreviewer.zoomOut', () => previewProvider.zoomOut()],
        ['sidebarPreviewer.zoomReset', () => previewProvider.zoomReset()],
        ['sidebarPreviewer.locateEditor', () => previewProvider.locateEditor()],
        ['sidebarPreviewer.locatePreview', () => previewProvider.locatePreview()],
        ['sidebarPreviewer.enableFollowScroll', () => previewProvider.enableFollowScroll()],
        ['sidebarPreviewer.disableFollowScroll', () => previewProvider.disableFollowScroll()],
        ['sidebarPreviewer.expandAll', () => previewProvider.expandAll()],
        ['sidebarPreviewer.collapseAll', () => previewProvider.collapseAll()],
        ['sidebarPreviewer.copyDataTreeLocator', () => previewProvider.copyDataTreeLocator()],
        ['sidebarPreviewer.feedback', () => vscode.env.openExternal(feedbackIssuesUrl)]
    ];

    for (const [command, handler] of commandHandlers) {
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    }
}

/**
 * 完成由 VS Code Disposable 自动管理的扩展停用流程
 */
export function deactivate() {}
