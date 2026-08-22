import { createThemeCss, dark, light } from '@reqly/design-system';
const THEME_CSS = createThemeCss(light, dark, {
    lightSelector: ':root',
    darkSelector: ':root.reqly-dark',
});
export interface CollectionsPageOptions {
    scriptUri: string;
    styleUri: string;
    cspSource: string;
    nonce: string;
}
export function renderCollectionsPage({
    scriptUri,
    styleUri,
    cspSource,
    nonce,
}: CollectionsPageOptions): string {
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
    <link rel="stylesheet" href="${styleUri}" />
    <style nonce="${nonce}">${THEME_CSS}</style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
