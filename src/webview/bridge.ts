import type { PanelMessage } from '../core/messages';
import { emit, persistable } from './store';

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
    emit('active');

    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => post({ type: 'persist', state: persistable() }), 300);
}

export function flushPersist(): void {
    window.clearTimeout(persistTimer);
    post({ type: 'persist', state: persistable() });
}
