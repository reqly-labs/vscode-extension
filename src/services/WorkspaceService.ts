import { collectSecrets, redactWorkspace, restoreWorkspace } from '../core/secrets';
import type { RequestSnapshot } from '../core/types';
import {
    createCollection,
    createFolder,
    createRequest,
    createWorkspace,
    deleteNode,
    duplicateNode,
    moveNode,
    renameNode,
    updateRequestSnapshot,
    type ParentId,
    type Workspace,
    type WorkspaceResult,
} from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';
import { Emitter } from '../utils/Emitter';
import type { SecretStore } from './SecretStore';

const STORAGE_KEY = 'reqly.workspace';

export interface WorkspaceChange {
    removedIds: string[];
}

export interface WorkspaceStorage {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

export class WorkspaceService {
    private state: Workspace;
    private restored: Promise<void> | undefined;
    private readonly changeEmitter = new Emitter<WorkspaceChange>();
    readonly onDidChange = this.changeEmitter.event;
    readonly loadRepairs: string[];
    constructor(
        private readonly memento: WorkspaceStorage,
        private readonly secrets?: SecretStore
    ) {
        const { workspace, repairs } = normalizeWorkspace(memento.get(STORAGE_KEY));

        this.state = workspace;
        this.loadRepairs = repairs;
    }

    async restoreSecrets(): Promise<void> {
        this.restored ??= this.loadSecrets();
        await this.restored;
    }

    private async loadSecrets(): Promise<void> {
        if (!this.secrets) {
            return;
        }

        const legacy = collectSecrets(this.state);
        const vault = await this.secrets.readWorkspace();

        this.state = restoreWorkspace(this.state, { ...legacy, ...vault });
        if (Object.keys(legacy).length > 0) {
            await this.commit(this.state, []);
        }
    }

    get workspace(): Workspace {
        return this.state;
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }

    async createCollection(name: string): Promise<WorkspaceResult> {
        return this.apply(createCollection(this.state, name));
    }

    async createFolder(parentId: string, name: string): Promise<WorkspaceResult> {
        return this.apply(createFolder(this.state, parentId, name));
    }

    async createRequest(
        parentId: ParentId,
        name: string,
        snapshot?: RequestSnapshot
    ): Promise<WorkspaceResult> {
        return this.apply(createRequest(this.state, parentId, name, snapshot));
    }

    async rename(id: string, name: string): Promise<WorkspaceResult> {
        return this.apply(renameNode(this.state, id, name));
    }

    async move(id: string, targetParentId: ParentId, index?: number): Promise<WorkspaceResult> {
        return this.apply(moveNode(this.state, id, targetParentId, index));
    }

    async duplicate(id: string): Promise<WorkspaceResult> {
        return this.apply(duplicateNode(this.state, id));
    }

    async updateSnapshot(id: string, snapshot: RequestSnapshot): Promise<WorkspaceResult> {
        return this.apply(updateRequestSnapshot(this.state, id, snapshot));
    }

    async remove(id: string): Promise<WorkspaceResult> {
        const result = deleteNode(this.state, id);

        if (!result.ok) {
            return result;
        }

        await this.commit(result.workspace, result.removedIds);

        return { ok: true, workspace: result.workspace, id };
    }

    private async apply(result: WorkspaceResult): Promise<WorkspaceResult> {
        if (result.ok) {
            await this.commit(result.workspace, []);
        }

        return result;
    }

    private async commit(next: Workspace, removedIds: string[]): Promise<void> {
        this.state = next;
        const vaulted = await this.secrets?.writeWorkspace(collectSecrets(next));

        await this.memento.update(STORAGE_KEY, vaulted ? redactWorkspace(next) : next);
        this.changeEmitter.fire({ removedIds });
    }

    async clear(): Promise<void> {
        const removedIds = Object.keys(this.state.nodes);

        await this.commit(createWorkspace(), removedIds);
    }
}
