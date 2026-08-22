import { createThemeCss, dark, light } from '@reqly/design-system';
import { APP_DESCRIPTION } from '../brand';

const THEME_CSS = createThemeCss(light, dark, {
    lightSelector: ':root',
    darkSelector: ':root.reqly-dark',
});

export interface SidebarPageOptions {
    mascotUri: string;
    cspSource: string;
    isDark: boolean;
    nonce: string;
}

export function renderSidebarPage({
    mascotUri,
    cspSource,
    isDark,
    nonce,
}: SidebarPageOptions): string {
    return `<!DOCTYPE html>
<html lang="en" class="${isDark ? 'reqly-dark' : ''}">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <style nonce="${nonce}">
        ${THEME_CSS}

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 16px 12px;
            font-family: var(--font-sans);
            font-size: 12px;
            color: var(--color-text);
            background: transparent;
        }

        .hero {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            text-align: center;
            padding: 4px 0 18px;
        }

        .hero img {
            width: 60px;
            height: 60px;
            filter: drop-shadow(0 2px 6px oklch(0 0 0 / 0.28));
        }

        .hero h1 {
            margin: 2px 0 0;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: -0.01em;
        }

        .hero p {
            margin: 0;
            font-size: 11.5px;
            line-height: 1.5;
            color: var(--color-text-subtle);
        }

        .actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            width: 100%;
            padding: 8px 10px;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            background: var(--color-surface);
            color: var(--color-text);
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            transition:
                background var(--transition-fast),
                border-color var(--transition-fast);
        }

        button:hover {
            background: var(--color-surface-hover);
            border-color: color-mix(in oklch, var(--color-primary) 40%, transparent);
        }

        button.primary {
            border-color: transparent;
            background: var(--color-primary);
            color: var(--color-primary-fg);
            font-weight: 600;
        }

        button.primary:hover {
            background: var(--color-primary-hover);
        }

        button svg {
            width: 14px;
            height: 14px;
        }
    </style>
</head>
<body>
    <div class="hero">
        <img src="${mascotUri}" alt="" />
        <h1>Reqly</h1>
        <p>${APP_DESCRIPTION}</p>
    </div>

    <div class="actions">
        <button class="primary" data-command="newRequest" title="Opens the client with a blank request.">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            New Request
        </button>
        <button data-command="openPanel" title="Opens the client where you left off.">Open HTTP Client</button>
        <button data-command="repository">View on GitHub</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.querySelectorAll('button').forEach((button) => {
            button.addEventListener('click', () => {
                vscode.postMessage({ command: button.dataset.command });
            });
        });
    </script>
</body>
</html>`;
}
