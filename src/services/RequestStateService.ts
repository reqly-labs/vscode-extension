import * as vscode from 'vscode';
import type { WebviewState } from '../core/messages';
import { redactSnapshot, restoreSnapshot, secretOf } from '../core/secrets';
import { createSettings, createSnapshot } from '../core/types';
import type { SecretStore } from './SecretStore';
const STORAGE_KEY = 'reqly.requestState';
export class RequestStateService {
    constructor(
        private readonly memento: vscode.Memento,
        private readonly secrets?: SecretStore
    ) {}
    read(): WebviewState {
        const stored = this.memento.get<Partial<WebviewState>>(STORAGE_KEY);
        return {
            snapshot: { ...createSnapshot(), ...stored?.snapshot },
            settings: { ...createSettings(), ...stored?.settings },
            activeRequestTab: stored?.activeRequestTab ?? 'params',
            activeResponseTab: stored?.activeResponseTab ?? 'body',
            activeRequestId:
                typeof stored?.activeRequestId === 'string' ? stored.activeRequestId : null,
        };
    }
    async migrate(): Promise<void> {
        const state = this.read();
        if (!this.secrets || !secretOf(state.snapshot.auth)) {
            return;
        }
        await this.write(state);
    }
    async readWithSecret(): Promise<WebviewState> {
        const state = this.read();
        const secret = (await this.secrets?.readDraft()) ?? '';
        return { ...state, snapshot: restoreSnapshot(state.snapshot, secret) };
    }
    async write(state: WebviewState): Promise<void> {
        const vaulted = await this.secrets?.writeDraft(secretOf(state.snapshot.auth));
        await this.memento.update(STORAGE_KEY, {
            ...state,
            snapshot: vaulted ? redactSnapshot(state.snapshot) : state.snapshot,
        });
    }
    async setActiveRequestId(activeRequestId: string | null): Promise<void> {
        await this.memento.update(STORAGE_KEY, { ...this.read(), activeRequestId });
    }
    async writeFromWebview(state: WebviewState, activeRequestId: string | null): Promise<boolean> {
        if (state.activeRequestId !== activeRequestId) {
            return false;
        }
        await this.write({ ...state, activeRequestId });
        return true;
    }
    async reset(): Promise<void> {
        await this.memento.update(STORAGE_KEY, undefined);
        await this.secrets?.clear();
    }
}
