import * as vscode from 'vscode';
import { APP_NAME } from '../brand';
import { pickContainer } from '../commands/collections';
import type {
    ActiveRequestInfo,
    EnvironmentInfo,
    HostMessage,
    PanelMessage,
    WebviewState,
} from '../core/messages';
import type { RequestSnapshot } from '../core/types';
import { interpolateSnapshot, unresolvedInSnapshot } from '../core/variables';
import { ancestorsOf, getRequest, requestLabel } from '../core/workspace';
import { BuildError, buildRequest } from '../http/buildRequest';
import { decodeResponse } from '../http/decodeResponse';
import { executeRequest, TransportError } from '../http/executeRequest';
import type { EnvironmentService } from '../services/EnvironmentService';
import type { RequestStateService } from '../services/RequestStateService';
import type { WorkspaceService } from '../services/WorkspaceService';
import { renderPanelHtml } from './html';

export interface PanelDependencies {
    store: RequestStateService;
    workspaceService: WorkspaceService;
    environments: EnvironmentService;
    onActiveChanged?: () => void;
}

export class RequestPanel {
    public static readonly viewType = 'reqly.requestPanel';
    private static current: RequestPanel | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private inFlight: AbortController | undefined;
    private lastBody: Buffer | undefined;
    private ready = false;
    private pending: 'send' | 'save' | 'environments' | undefined;
    private activeRequestId: string | null = null;
    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly deps: PanelDependencies
    ) {
        this.panel.webview.html = renderPanelHtml(this.panel.webview, this.extensionUri);
        this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png');
        this.activeRequestId = this.validLink(this.store.read().activeRequestId);
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message: PanelMessage) => this.handle(message)),
            vscode.window.onDidChangeActiveColorTheme(() =>
                this.send({ type: 'theme', theme: this.themeKind() })
            ),
            this.deps.workspaceService.onDidChange(({ removedIds }) => {
                if (this.activeRequestId && removedIds.includes(this.activeRequestId)) {
                    this.activeRequestId = null;
                    void this.persistLink();
                }

                if (this.ready) {
                    this.send({ type: 'activeChanged', active: this.describeActive() });
                }
            })
        );
        this.panel.onDidDispose(() => this.dispose());
    }

    private get store(): RequestStateService {
        return this.deps.store;
    }

    static show(
        context: vscode.ExtensionContext,
        deps: PanelDependencies,
        options: { preserveFocus?: boolean } = {}
    ): RequestPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (RequestPanel.current) {
            RequestPanel.current.panel.reveal(column, options.preserveFocus);

            return RequestPanel.current;
        }

        const panel = vscode.window.createWebviewPanel(
            RequestPanel.viewType,
            APP_NAME,
            { viewColumn: column, preserveFocus: options.preserveFocus },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist'),
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                ],
            }
        );

        RequestPanel.current = new RequestPanel(panel, context.extensionUri, deps);

        return RequestPanel.current;
    }

    static get activeId(): string | null {
        return RequestPanel.current?.activeRequestId ?? null;
    }

    static notifyEnvironment(): void {
        RequestPanel.current?.sendEnvironment();
    }

    async openRequest(id: string): Promise<void> {
        const node = getRequest(this.deps.workspaceService.workspace, id);

        if (!node) {
            void vscode.window.showWarningMessage('That request no longer exists.');

            return;
        }

        this.activeRequestId = id;
        this.deps.onActiveChanged?.();
        const state: WebviewState = {
            ...this.store.read(),
            snapshot: structuredClone(node.snapshot),
            activeRequestId: id,
        };

        await this.store.write(state);
        this.panel.reveal(this.panel.viewColumn, true);
        if (!this.ready) {
            return;
        }

        this.send({ type: 'loadRequest', state, active: this.describeActive() });
    }

    triggerSend(): void {
        this.panel.reveal(this.panel.viewColumn);
        if (!this.ready) {
            this.pending = 'send';

            return;
        }

        this.send({ type: 'command', name: 'send' });
    }

    triggerEnvironments(): void {
        this.panel.reveal(this.panel.viewColumn);

        if (!this.ready) {
            this.pending = 'environments';

            return;
        }

        this.send({ type: 'command', name: 'environments' });
    }

    triggerSave(): void {
        this.panel.reveal(this.panel.viewColumn);
        if (!this.ready) {
            this.pending = 'save';

            return;
        }

        this.send({ type: 'command', name: 'save' });
    }

    private validLink(id: string | null): string | null {
        if (!id) {
            return null;
        }

        return getRequest(this.deps.workspaceService.workspace, id) ? id : null;
    }

    describeEnvironment(): EnvironmentInfo {
        return {
            activeId: this.deps.environments.activeId,
            environments: [...this.deps.environments.environments],
        };
    }

    sendEnvironment(): void {
        if (this.ready) {
            this.send({ type: 'environment', environment: this.describeEnvironment() });
        }
    }

    private describeActive(): ActiveRequestInfo {
        const { workspace } = this.deps.workspaceService;
        const node = this.activeRequestId ? getRequest(workspace, this.activeRequestId) : undefined;

        if (!node) {
            return { id: null, name: '', location: '' };
        }

        return {
            id: node.id,
            name: requestLabel(node),
            location: ancestorsOf(workspace, node.id)
                .map((group) => group.name)
                .join(' / '),
        };
    }

    private async persistLink(): Promise<void> {
        await this.store.setActiveRequestId(this.activeRequestId);
    }

    private themeKind(): 'light' | 'dark' {
        const { kind } = vscode.window.activeColorTheme;

        return kind === vscode.ColorThemeKind.Light ||
            kind === vscode.ColorThemeKind.HighContrastLight
            ? 'light'
            : 'dark';
    }

    private send(message: HostMessage): void {
        void this.panel.webview.postMessage(message);
    }

    private async handle(message: PanelMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                this.ready = true;
                this.send({
                    type: 'init',
                    state: {
                        ...(await this.store.readWithSecret()),
                        activeRequestId: this.activeRequestId,
                    },
                    theme: this.themeKind(),
                    active: this.describeActive(),
                    environment: this.describeEnvironment(),
                    mascotUri: this.panel.webview
                        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png'))
                        .toString(),
                });
                if (this.pending) {
                    this.send({ type: 'command', name: this.pending });
                    this.pending = undefined;
                }

                break;
            case 'persist':
                await this.store.writeFromWebview(message.state, this.activeRequestId);
                break;
            case 'save':
                await this.saveActive(message.snapshot);
                break;
            case 'saveAs':
                await this.saveAs(message.snapshot);
                break;
            case 'send':
                await this.dispatch(message);
                break;
            case 'cancel':
                this.inFlight?.abort();
                this.inFlight = undefined;
                break;
            case 'copy':
                await vscode.env.clipboard.writeText(message.text);
                vscode.window.setStatusBarMessage(`${message.label} copied to clipboard`, 2000);
                break;
            case 'pickFile':
                await this.pickFile(message.target, message.fieldId);
                break;
            case 'saveResponse':
                await this.saveResponse(message.fileName);
                break;
            case 'openExternal':
                await vscode.env.openExternal(vscode.Uri.parse(message.url));
                break;
            case 'notify':
                this.notify(message.level, message.text);
                break;
            case 'selectEnvironment':
                await this.deps.environments.setActive(message.id);
                break;
            case 'createEnvironment':
                await this.deps.environments.create(message.name);
                break;
            case 'renameEnvironment':
                await this.deps.environments.rename(message.id, message.name);
                break;
            case 'duplicateEnvironment':
                await this.deps.environments.duplicate(message.id);
                break;
            case 'removeEnvironment':
                await this.deps.environments.remove(message.id);
                break;
            case 'saveVariables':
                await this.deps.environments.replaceVariables(message.id, message.variables);
                break;
        }
    }

    private async saveActive(snapshot: RequestSnapshot): Promise<void> {
        if (!this.activeRequestId) {
            await this.saveAs(snapshot);

            return;
        }

        const result = await this.deps.workspaceService.updateSnapshot(
            this.activeRequestId,
            snapshot
        );

        if (!result.ok) {
            this.activeRequestId = null;
            this.deps.onActiveChanged?.();
            this.send({ type: 'activeChanged', active: this.describeActive() });
            void vscode.window.showWarningMessage(result.reason);
            await this.saveAs(snapshot);

            return;
        }

        this.send({ type: 'saved', active: this.describeActive() });
        vscode.window.setStatusBarMessage('Request saved', 2000);
    }

    private async saveAs(snapshot: RequestSnapshot): Promise<void> {
        const { workspaceService } = this.deps;
        const parentId = await pickContainer(workspaceService.workspace, 'Save the request where?');

        if (parentId === undefined) {
            return;
        }

        const suggested = requestLabel({
            id: '',
            kind: 'request',
            name: '',
            snapshot,
            createdAt: 0,
            updatedAt: 0,
        });
        const name = await vscode.window.showInputBox({
            prompt: 'Name for the request',
            value: suggested,
            validateInput: (input) => (input.trim() ? undefined : 'The name cannot be empty.'),
        });

        if (name === undefined) {
            return;
        }

        const result = await workspaceService.createRequest(parentId, name, snapshot);

        if (!result.ok) {
            void vscode.window.showWarningMessage(result.reason);

            return;
        }

        this.activeRequestId = result.id;
        this.deps.onActiveChanged?.();
        await this.persistLink();
        this.send({ type: 'saved', active: this.describeActive() });
        vscode.window.setStatusBarMessage(`Saved as "${name.trim()}"`, 2500);
    }

    private notify(level: 'info' | 'warn' | 'error', text: string): void {
        if (level === 'error') {
            void vscode.window.showErrorMessage(text);

            return;
        }

        if (level === 'warn') {
            void vscode.window.showWarningMessage(text);

            return;
        }

        vscode.window.setStatusBarMessage(text, 2500);
    }

    private async dispatch(
        message: Extract<
            PanelMessage,
            {
                type: 'send';
            }
        >
    ): Promise<void> {
        this.inFlight?.abort();
        const controller = new AbortController();

        this.inFlight = controller;
        try {
            const values = this.deps.environments.values;
            const missing = unresolvedInSnapshot(message.snapshot, values);

            if (missing.length > 0) {
                this.notify(
                    'warn',
                    `No value for ${missing.map((name) => `{{${name}}}`).join(', ')}. The request was sent with the text as written.`
                );
            }

            const wire = await buildRequest(interpolateSnapshot(message.snapshot, values));
            const raw = await executeRequest(wire, message.settings, controller.signal);

            if (controller.signal.aborted) {
                return;
            }

            this.lastBody = raw.body;
            this.send({
                type: 'response',
                requestId: message.requestId,
                response: decodeResponse(raw),
            });
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }

            this.send({
                type: 'error',
                requestId: message.requestId,
                error: toPanelError(error),
            });
        } finally {
            if (this.inFlight === controller) {
                this.inFlight = undefined;
            }
        }
    }

    private async pickFile(target: 'multipart' | 'binary', fieldId: string): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Attach',
        });
        const file = picked?.[0];

        if (file) {
            this.send({ type: 'filePicked', target, fieldId, path: file.fsPath });
        }
    }

    private async saveResponse(fileName: string): Promise<void> {
        if (!this.lastBody) {
            void vscode.window.showWarningMessage('There is no response to save yet.');

            return;
        }

        const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const target = await vscode.window.showSaveDialog({
            defaultUri: folder ? vscode.Uri.joinPath(folder, fileName) : undefined,
            saveLabel: 'Save response',
        });

        if (!target) {
            return;
        }

        await vscode.workspace.fs.writeFile(target, this.lastBody);
        vscode.window.setStatusBarMessage(`Response saved to ${target.fsPath}`, 3000);
    }

    private dispose(): void {
        RequestPanel.current = undefined;
        this.deps.onActiveChanged?.();
        this.inFlight?.abort();
        this.disposables.forEach((disposable) => disposable.dispose());
        this.panel.dispose();
    }
}

function toPanelError(error: unknown): {
    message: string;
    detail?: string;
} {
    if (error instanceof BuildError) {
        return { message: error.message };
    }

    if (error instanceof TransportError) {
        return { message: error.message, detail: error.detail };
    }

    if (error instanceof Error) {
        return { message: error.message };
    }

    return { message: 'The request failed for an unknown reason.' };
}
