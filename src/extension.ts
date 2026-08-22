import * as vscode from 'vscode';
import { registerCollectionCommands } from './commands/collections';
import { RequestPanel, type PanelDependencies } from './panel/RequestPanel';
import { CollectionsTreeProvider } from './providers/CollectionsTreeProvider';
import { RequestStateService } from './services/RequestStateService';
import { WorkspaceService } from './services/WorkspaceService';

export function activate(context: vscode.ExtensionContext): void {
    const store = new RequestStateService(context.workspaceState);
    const workspaceService = new WorkspaceService(context.globalState);

    const treeProvider = new CollectionsTreeProvider(workspaceService, () => RequestPanel.activeId);

    const deps: PanelDependencies = {
        store,
        workspaceService,
        onActiveChanged: () => treeProvider.refresh(),
    };

    const treeView = vscode.window.createTreeView(CollectionsTreeProvider.viewType, {
        treeDataProvider: treeProvider,
        dragAndDropController: treeProvider,
        showCollapseAll: true,
        canSelectMany: false,
    });

    const reveal = async (id: string, options?: { expand?: boolean }) => {
        try {
            await treeView.reveal(id, { select: true, focus: false, expand: options?.expand });
        } catch {
        }
    };

    const openRequest = async (id: string) => {
        await RequestPanel.show(context, deps).openRequest(id);
    };

    context.subscriptions.push(
        treeView,
        workspaceService,
        workspaceService.onDidChange(() => treeProvider.refresh()),

        vscode.commands.registerCommand('reqly.openPanel', () => {
            RequestPanel.show(context, deps);
        }),

        vscode.commands.registerCommand('reqly.newRequest', async () => {
            await RequestPanel.show(context, deps).reset();
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand('reqly.sendRequest', () => {
            RequestPanel.show(context, deps).triggerSend();
        }),

        vscode.commands.registerCommand('reqly.saveRequest', () => {
            RequestPanel.show(context, deps).triggerSave();
        }),

        ...registerCollectionCommands({ workspaceService, reveal, openRequest })
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
