import * as vscode from 'vscode';
import { createThemeCss, dark, light } from '@reqly/design-system';
import { APP_NAME } from '../brand';
import { createNonce } from '../utils/nonce';

const THEME_CSS = createThemeCss(light, dark, {
    lightSelector: ':root',
    darkSelector: ':root.reqly-dark',
});

export function renderPanelHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const asset = (...segments: string[]) =>
        webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...segments));

    const script = asset('dist', 'webview.js');
    const styles = asset('dist', 'webview.css');
    const token = createNonce();

    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} data:`,
        `style-src ${webview.cspSource} 'nonce-${token}'`,
        `script-src 'nonce-${token}'`,
        `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>${APP_NAME}</title>
    <link rel="stylesheet" href="${styles}" />
    <style nonce="${token}">${THEME_CSS}</style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${token}" src="${script}"></script>
</body>
</html>`;
}
