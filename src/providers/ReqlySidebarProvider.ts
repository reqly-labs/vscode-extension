import * as vscode from 'vscode';
import { REPO_URL } from '../brand';
import { renderSidebarPage } from './sidebarPage';

/**
 * The activity-bar entry point. It stays intentionally small — the request
 * workspace itself lives in an editor panel where there is room for it.
 */
export class ReqlySidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'reqly.sidebar';

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        };

        const render = () => {
            view.webview.html = renderSidebarPage({
                mascotUri: view.webview
                    .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png'))
                    .toString(),
                cspSource: view.webview.cspSource,
                isDark: !isLightTheme(),
            });
        };

        render();

        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(render);
        view.onDidDispose(() => themeSubscription.dispose());

        view.webview.onDidReceiveMessage((message: { command?: string }) => {
            switch (message.command) {
                case 'newRequest':
                    void vscode.commands.executeCommand('reqly.newRequest');
                    break;
                case 'openPanel':
                    void vscode.commands.executeCommand('reqly.openPanel');
                    break;
                case 'repository':
                    void vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
                    break;
            }
        });
    }
}

function isLightTheme(): boolean {
    const { kind } = vscode.window.activeColorTheme;

    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}
