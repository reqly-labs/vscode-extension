import type { PanelMessage } from '../core/messages';
import { commit, persistable } from './store';

interface VsCodeApi {
    postMessage(message: PanelMessage): void;
    getState(): unknown;
    setState(value: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

export function post(message: PanelMessage): void {
    vscode.postMessage(message);
}

let persistTimer: number | undefined;

export function schedulePersist(): void {
    commit();
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(flushPersist, 300);
}

export function flushPersist(): void {
    window.clearTimeout(persistTimer);
    persistTimer = undefined;
    post({ type: 'persist', state: persistable() });
}

export function flushPendingPersist(): void {
    if (persistTimer !== undefined) {
        flushPersist();
    }
}
