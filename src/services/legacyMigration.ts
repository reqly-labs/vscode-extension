import type * as vscode from 'vscode';
import { normalizeWorkspace } from '../core/workspaceIntegrity';
import type { Workspace } from '../core/workspace';

export const LEGACY_WORKSPACE_KEY = 'reqly.workspace';

export interface LegacyStorage {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

export interface MigrationResult {
    moved: boolean;
    collections: number;
    requests: number;
}

export async function migrateLegacyWorkspace(
    memento: LegacyStorage,
    current: Workspace,
    save: (workspace: Workspace) => Promise<void>
): Promise<MigrationResult> {
    const raw = memento.get<unknown>(LEGACY_WORKSPACE_KEY);

    if (raw === undefined) {
        return { moved: false, collections: 0, requests: 0 };
    }

    if (current.rootIds.length > 0) {
        await memento.update(LEGACY_WORKSPACE_KEY, undefined);

        return { moved: false, collections: 0, requests: 0 };
    }

    const { workspace } = normalizeWorkspace(raw);
    const nodes = Object.values(workspace.nodes);

    if (nodes.length === 0) {
        await memento.update(LEGACY_WORKSPACE_KEY, undefined);

        return { moved: false, collections: 0, requests: 0 };
    }

    await save(workspace);
    await memento.update(LEGACY_WORKSPACE_KEY, undefined);

    return {
        moved: true,
        collections: nodes.filter((node) => node.kind === 'collection').length,
        requests: nodes.filter((node) => node.kind === 'request').length,
    };
}

export type LegacyMemento = vscode.Memento;
