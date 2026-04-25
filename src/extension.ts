import * as vscode from 'vscode';
import { PreviewProvider } from './previewProvider';
import { initI18n } from './i18n';

// 激活扩展并注册侧边栏预览能力
export function activate(context: vscode.ExtensionContext) {
    // 初始化国际化
    initI18n();
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
        ['sidebarPreviewer.feedback', () => vscode.env.openExternal(feedbackIssuesUrl)]
    ];

    for (const [command, handler] of commandHandlers) {
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    }
}

// 释放扩展生命周期中的资源与状态
export function deactivate() {}
