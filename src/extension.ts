import * as vscode from 'vscode';
import { RequestPanel } from './panel/RequestPanel';
import { ReqlySidebarProvider } from './providers/ReqlySidebarProvider';
import { RequestStateService } from './services/RequestStateService';

export function activate(context: vscode.ExtensionContext): void {
    const store = new RequestStateService(context.workspaceState);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ReqlySidebarProvider.viewType,
            new ReqlySidebarProvider(context.extensionUri)
        ),

        vscode.commands.registerCommand('reqly.openPanel', () => {
            RequestPanel.show(context, store);
        }),

        vscode.commands.registerCommand('reqly.newRequest', async () => {
            await RequestPanel.show(context, store).reset();
        }),

        vscode.commands.registerCommand('reqly.sendRequest', () => {
            RequestPanel.show(context, store).triggerSend();
        })
    );
}

export function deactivate(): void {}
