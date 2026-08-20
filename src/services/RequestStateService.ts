import * as vscode from 'vscode';
import type { WebviewState } from '../core/messages';
import { createSettings, createSnapshot } from '../core/types';

const STORAGE_KEY = 'reqly.requestState';

/** Keeps the in-flight request across window reloads and panel disposals. */
export class RequestStateService {
    constructor(private readonly memento: vscode.Memento) {}

    read(): WebviewState {
        const stored = this.memento.get<Partial<WebviewState>>(STORAGE_KEY);

        return {
            snapshot: { ...createSnapshot(), ...stored?.snapshot },
            settings: { ...createSettings(), ...stored?.settings },
            activeRequestTab: stored?.activeRequestTab ?? 'params',
            activeResponseTab: stored?.activeResponseTab ?? 'body',
        };
    }

    async write(state: WebviewState): Promise<void> {
        await this.memento.update(STORAGE_KEY, state);
    }

    async reset(): Promise<void> {
        await this.memento.update(STORAGE_KEY, undefined);
    }
}
