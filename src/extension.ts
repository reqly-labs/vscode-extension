import * as vscode from 'vscode';
import { registerCollectionCommands } from './commands/collections';
import { RequestPanel, type PanelDependencies } from './panel/RequestPanel';
import { CollectionsViewProvider } from './providers/CollectionsViewProvider';
import { ReqlySidebarProvider } from './providers/ReqlySidebarProvider';
import { RequestStateService } from './services/RequestStateService';
import { WorkspaceService } from './services/WorkspaceService';

export function activate(context: vscode.ExtensionContext): void {
    const store = new RequestStateService(context.workspaceState);
    const workspaceService = new WorkspaceService(context.globalState);

    const collectionsView = new CollectionsViewProvider(
        context.extensionUri,
        workspaceService,
        context.globalState,
        {
            openRequest: async (id) => {
                await RequestPanel.show(context, deps).openRequest(id);
            },
            activeRequestId: () => RequestPanel.activeId,
        }
    );

    const deps: PanelDependencies = {
        store,
        workspaceService,
        onActiveChanged: () => collectionsView.refresh(),
    };

    const openRequest = async (id: string) => {
        await RequestPanel.show(context, deps).openRequest(id);
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CollectionsViewProvider.viewType,
            collectionsView,
            { webviewOptions: { retainContextWhenHidden: true } }
        ),

        vscode.window.registerWebviewViewProvider(
            ReqlySidebarProvider.viewType,
            new ReqlySidebarProvider(context.extensionUri)
        ),

        workspaceService,
        workspaceService.onDidChange(() => collectionsView.refresh()),

        vscode.commands.registerCommand('reqly.openPanel', () => {
            RequestPanel.show(context, deps);
        }),

        vscode.commands.registerCommand('reqly.newRequest', async () => {
            await RequestPanel.show(context, deps).reset();
        }),

        vscode.commands.registerCommand('reqly.sendRequest', () => {
            RequestPanel.show(context, deps).triggerSend();
        }),

        vscode.commands.registerCommand('reqly.saveRequest', () => {
            RequestPanel.show(context, deps).triggerSave();
        }),

        ...registerCollectionCommands({
            workspaceService,
            reveal: (id) => collectionsView.reveal(id),
            openRequest,
        })
    );

    if (workspaceService.loadRepairs.length > 0) {
        void reportRepairs(workspaceService.loadRepairs);
    }
}

async function reportRepairs(repairs: string[]): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
        `Reqly repaired ${repairs.length} problem${repairs.length === 1 ? '' : 's'} in your saved collections.`,
        'Show details'
    );

    if (choice !== 'Show details') {
        return;
    }

    const channel = vscode.window.createOutputChannel('Reqly');
    channel.appendLine('Repairs applied while loading collections:');
    repairs.forEach((line) => channel.appendLine(`  - ${line}`));
    channel.show();
}

export function deactivate(): void {}
