import type { PanelMessage } from '../core/messages';
import { persistable } from './store';

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

/** Coalesces the flood of edits a user makes into one write per idle moment. */
export function schedulePersist(): void {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => post({ type: 'persist', state: persistable() }), 300);
}

export function flushPersist(): void {
    window.clearTimeout(persistTimer);
    post({ type: 'persist', state: persistable() });
}
