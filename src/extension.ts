import * as vscode from 'vscode';
import { PreviewProvider } from './previewProvider';
import { initI18n } from './i18n';

export function activate(context: vscode.ExtensionContext) {
    // 初始化国际化
    initI18n(context);

    const previewProvider = new PreviewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'sidebar-previewer',
            previewProvider
        )
    );

    // 注册缩放命令
    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.zoomIn', () => {
            previewProvider.zoomIn();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.zoomOut', () => {
            previewProvider.zoomOut();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.zoomReset', () => {
            previewProvider.zoomReset();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.locatePreview', () => {
            previewProvider.locatePreview();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.locateEditor', () => {
            previewProvider.locateEditor();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.enableFollowScroll', () => {
            previewProvider.enableFollowScroll();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.disableFollowScroll', () => {
            previewProvider.disableFollowScroll();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.expandAll', () => {
            previewProvider.expandAll();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sidebarPreviewer.collapseAll', () => {
            previewProvider.collapseAll();
        })
    );
}

export function deactivate() {}