import * as vscode from 'vscode';
import { RequestPanel, type PanelDependencies } from './panel/RequestPanel';
import { CollectionsViewProvider } from './providers/CollectionsViewProvider';
import { RequestStateService } from './services/RequestStateService';
import { SecretStore } from './services/SecretStore';
import { WorkspaceService } from './services/WorkspaceService';
export function activate(context: vscode.ExtensionContext): void {
    const secrets = new SecretStore(context.secrets);
    const store = new RequestStateService(context.workspaceState, secrets);
    const workspaceService = new WorkspaceService(context.globalState, secrets);
    const collectionsView = new CollectionsViewProvider(
        context.extensionUri,
        workspaceService,
        context.globalState,
        {
            openRequest: async (id) => {
                await RequestPanel.show(context, deps, { preserveFocus: true }).openRequest(id);
            },
            activeRequestId: () => RequestPanel.activeId,
        }
    );
    const deps: PanelDependencies = {
        store,
        workspaceService,
        onActiveChanged: () => collectionsView.refresh(),
    };
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CollectionsViewProvider.viewType,
            collectionsView,
            { webviewOptions: { retainContextWhenHidden: true } }
        ),
        workspaceService,
        workspaceService.onDidChange(() => collectionsView.refresh()),
        vscode.commands.registerCommand('reqly.newRequest', async () => {
            await collectionsView.createRequest(null);
        }),
        vscode.commands.registerCommand('reqly.newCollection', async () => {
            await collectionsView.createCollection();
        }),
        vscode.commands.registerCommand('reqly.openPanel', () => {
            RequestPanel.show(context, deps);
        }),
        vscode.commands.registerCommand('reqly.sendRequest', () => {
            RequestPanel.show(context, deps).triggerSend();
        }),
        vscode.commands.registerCommand('reqly.saveRequest', () => {
            RequestPanel.show(context, deps).triggerSave();
        })
    );
    void workspaceService.restoreSecrets();
    void store.migrate();
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
