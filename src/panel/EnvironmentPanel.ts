import { createThemeCss, dark, light } from '@reqly/design-system';
import * as vscode from 'vscode';
import {
    toRows,
    type EnvironmentHostMessage,
    type EnvironmentView,
    type EnvironmentViewMessage,
} from '../core/environmentMessages';
import type { EnvironmentService } from '../services/EnvironmentService';
import { createNonce } from '../utils/nonce';

const THEME_CSS = createThemeCss(light, dark, {
    lightSelector: ':root',
    darkSelector: ':root.reqly-dark',
});

function themeKind(): 'light' | 'dark' {
    const { kind } = vscode.window.activeColorTheme;

    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';
}

export class EnvironmentPanel {
    public static readonly viewType = 'reqly.environmentPanel';

    private static current: EnvironmentPanel | undefined;

    private readonly disposables: vscode.Disposable[] = [];
    private selectedId: string | null = null;
    private ready = false;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly environments: EnvironmentService
    ) {
        this.panel.webview.html = this.render();
        this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png');
        this.selectedId = environments.activeId ?? environments.environments[0]?.id ?? null;
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message: EnvironmentViewMessage) =>
                this.handle(message)
            ),
            vscode.window.onDidChangeActiveColorTheme(() =>
                this.post({ type: 'theme', theme: themeKind() })
            ),
            environments.onDidChange(() => this.refresh())
        );
        this.panel.onDidDispose(() => this.dispose());
    }

    static show(context: vscode.ExtensionContext, environments: EnvironmentService): void {
        if (EnvironmentPanel.current) {
            EnvironmentPanel.current.panel.reveal();

            return;
        }

        const panel = vscode.window.createWebviewPanel(
            EnvironmentPanel.viewType,
            'Reqly Environments',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist'),
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                ],
            }
        );

        EnvironmentPanel.current = new EnvironmentPanel(panel, context.extensionUri, environments);
    }

    private post(message: EnvironmentHostMessage): void {
        void this.panel.webview.postMessage(message);
    }

    private view(): EnvironmentView {
        const rows = toRows(this.environments.environments, this.environments.activeId);
        const known = rows.some((row) => row.id === this.selectedId);
        const selectedId = known ? this.selectedId : (rows[0]?.id ?? null);

        this.selectedId = selectedId;

        return {
            rows,
            selectedId,
            variables:
                this.environments.environments.find((entry) => entry.id === selectedId)
                    ?.variables ?? [],
        };
    }

    private refresh(): void {
        if (this.ready) {
            this.post({ type: 'render', view: this.view(), theme: themeKind() });
        }
    }

    private async handle(message: EnvironmentViewMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                this.ready = true;
                this.refresh();
                break;
            case 'select':
                this.selectedId = message.id;
                this.refresh();
                break;
            case 'activate':
                await this.environments.setActive(message.id);
                break;
            case 'create': {
                const name = await vscode.window.showInputBox({
                    prompt: 'Name for the environment',
                    value: 'New Environment',
                    validateInput: (input) =>
                        input.trim() ? undefined : 'The name cannot be empty.',
                });

                if (name !== undefined) {
                    const created = await this.environments.create(name);

                    this.selectedId = created.id;
                    this.refresh();
                }

                break;
            }

            case 'rename': {
                const name = await vscode.window.showInputBox({
                    prompt: 'New name for the environment',
                    value: message.name,
                    validateInput: (input) =>
                        input.trim() ? undefined : 'The name cannot be empty.',
                });

                if (name !== undefined) {
                    await this.environments.rename(message.id, name);
                }

                break;
            }

            case 'duplicate': {
                const copy = await this.environments.duplicate(message.id);

                if (copy) {
                    this.selectedId = copy.id;
                    this.refresh();
                }

                break;
            }

            case 'remove': {
                const target = this.environments.environments.find(
                    (entry) => entry.id === message.id
                );

                if (!target) {
                    break;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Delete the environment "${target.name}"?`,
                    { modal: true },
                    'Delete'
                );

                if (confirm === 'Delete') {
                    await this.environments.remove(message.id);
                }

                break;
            }

            case 'saveVariables':
                await this.environments.replaceVariables(message.id, message.variables);
                break;
        }
    }

    private render(): string {
        const asset = (...segments: string[]) =>
            this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...segments));
        const nonce = createNonce();
        const cspSource = this.panel.webview.cspSource;
        const csp = [
            `default-src 'none'`,
            `img-src ${cspSource} data:`,
            `style-src ${cspSource} 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`,
            `font-src ${cspSource}`,
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <link rel="stylesheet" href="${asset('dist', 'environments.css')}" />
    <style nonce="${nonce}">${THEME_CSS}</style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${asset('dist', 'environments.js')}"></script>
</body>
</html>`;
    }

    private dispose(): void {
        EnvironmentPanel.current = undefined;
        this.disposables.forEach((disposable) => disposable.dispose());
        this.panel.dispose();
    }
}
