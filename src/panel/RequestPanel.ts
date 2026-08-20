import * as vscode from 'vscode';
import { APP_NAME } from '../brand';
import type { HostMessage, PanelMessage } from '../core/messages';
import { createSettings, createSnapshot } from '../core/types';
import { BuildError, buildRequest } from '../http/buildRequest';
import { decodeResponse } from '../http/decodeResponse';
import { executeRequest, TransportError } from '../http/executeRequest';
import type { RequestStateService } from '../services/RequestStateService';
import { renderPanelHtml } from './html';

export class RequestPanel {
    public static readonly viewType = 'reqly.requestPanel';

    private static current: RequestPanel | undefined;

    private readonly disposables: vscode.Disposable[] = [];
    private inFlight: AbortController | undefined;

    private lastBody: Buffer | undefined;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly store: RequestStateService
    ) {
        this.panel.webview.html = renderPanelHtml(this.panel.webview, this.extensionUri);
        this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png');

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message: PanelMessage) => this.handle(message)),
            vscode.window.onDidChangeActiveColorTheme(() =>
                this.send({ type: 'theme', theme: this.themeKind() })
            )
        );

        this.panel.onDidDispose(() => this.dispose());
    }

    static show(context: vscode.ExtensionContext, store: RequestStateService): RequestPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (RequestPanel.current) {
            RequestPanel.current.panel.reveal(column);
            return RequestPanel.current;
        }

        const panel = vscode.window.createWebviewPanel(RequestPanel.viewType, APP_NAME, column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'dist'),
                vscode.Uri.joinPath(context.extensionUri, 'media'),
            ],
        });

        RequestPanel.current = new RequestPanel(panel, context.extensionUri, store);

        return RequestPanel.current;
    }

    async reset(): Promise<void> {
        await this.store.write({
            snapshot: createSnapshot(),
            settings: createSettings(),
            activeRequestTab: 'params',
            activeResponseTab: 'body',
        });

        this.panel.webview.html = renderPanelHtml(this.panel.webview, this.extensionUri);
    }

    triggerSend(): void {
        this.panel.reveal(this.panel.viewColumn);
        this.send({ type: 'command', name: 'send' });
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
                this.send({
                    type: 'init',
                    state: this.store.read(),
                    theme: this.themeKind(),
                    mascotUri: this.panel.webview
                        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png'))
                        .toString(),
                });
                break;

            case 'persist':
                await this.store.write(message.state);
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
        }
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

    private async dispatch(message: Extract<PanelMessage, { type: 'send' }>): Promise<void> {
        this.inFlight?.abort();

        const controller = new AbortController();
        this.inFlight = controller;

        try {
            const wire = await buildRequest(message.snapshot);
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
        this.inFlight?.abort();
        this.disposables.forEach((disposable) => disposable.dispose());
        this.panel.dispose();
    }
}

function toPanelError(error: unknown): { message: string; detail?: string } {
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
