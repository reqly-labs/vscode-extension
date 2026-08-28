import * as vscode from 'vscode';
import { readCertificateFiles, useAdditionalCertificates } from './http/certificates';
import { RequestPanel, type PanelDependencies } from './panel/RequestPanel';
import { CollectionsViewProvider } from './providers/CollectionsViewProvider';
import { CollectionStore } from './services/CollectionStore';
import { migrateLegacyWorkspace } from './services/legacyMigration';
import { RequestStateService } from './services/RequestStateService';
import { SecretStore } from './services/SecretStore';
import { resolveStorageRoot } from './services/storageLocation';
import { WorkspaceService } from './services/WorkspaceService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const secrets = new SecretStore(context.secrets);
    const store = new RequestStateService(context.workspaceState, secrets);
    const { root, location } = resolveStorageRoot(context);
    const collections = new CollectionStore(root);
    const workspaceService = await WorkspaceService.open(collections, secrets);
    const migration = await migrateLegacyWorkspace(
        context.globalState,
        workspaceService.workspace,
        async (legacy) => {
            await collections.save(legacy);
            await workspaceService.reload();
        }
    );

    collections.watch();
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
        collections,
        workspaceService.onDidChange(() => collectionsView.refresh()),
        collections.onDidChangeExternally(() => {
            background('reload collections from disk', workspaceService.reload());
        }),
        workspaceService.onSecretsUnavailable(() => {
            void vscode.window.showWarningMessage(
                'Reqly could not reach the credential store, so the credential was not saved. The rest of the request was.'
            );
        }),
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
    background('move credentials into the keychain', store.migrate());
    background('load certificate authorities', loadCertificateAuthorities());
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('reqly.certificateAuthority')) {
                background('load certificate authorities', loadCertificateAuthorities());
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('reqly.storage.location')) {
                void promptStorageReload();
            }
        })
    );

    if (workspaceService.loadRepairs.length > 0) {
        background('report workspace repairs', reportRepairs(workspaceService.loadRepairs));
    }

    if (workspaceService.unreadableFiles.length > 0) {
        void vscode.window.showWarningMessage(
            `Reqly skipped ${workspaceService.unreadableFiles.length} unreadable collection file(s): ${workspaceService.unreadableFiles.join(', ')}`
        );
    }

    if (migration.moved) {
        const where = location === 'workspace' ? 'this workspace' : 'Reqly global storage';

        void vscode.window.showInformationMessage(
            `Reqly moved ${migration.collections} collection(s) and ${migration.requests} request(s) into files in ${where}.`
        );
    }
}

async function promptStorageReload(): Promise<void> {
    const reload = 'Reload Window';
    const answer = await vscode.window.showInformationMessage(
        'Reqly collection storage changed. Reload the window to read from the new location.',
        reload
    );

    if (answer === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

function background(what: string, work: Promise<void>): void {
    work.catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);

        void vscode.window.showWarningMessage(`Reqly could not ${what}: ${detail}`);
    });
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

async function loadCertificateAuthorities(): Promise<void> {
    const paths = vscode.workspace
        .getConfiguration('reqly')
        .get<string[]>('certificateAuthority', []);
    const { certificates, failures } = await readCertificateFiles(paths);

    useAdditionalCertificates(certificates);

    if (failures.length > 0) {
        void vscode.window.showWarningMessage(
            `Reqly could not read ${failures.length} CA certificate file${failures.length === 1 ? '' : 's'}: ${failures.join(', ')}`
        );
    }
}
