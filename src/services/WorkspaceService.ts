import { collectSecrets, redactWorkspace, restoreWorkspace } from '../core/secrets';
import type { RequestSnapshot } from '../core/types';
import type { Variable } from '../core/variables';
import {
    createCollection,
    createFolder,
    createRequest,
    createWorkspace,
    deleteNode,
    duplicateNode,
    moveNode,
    renameNode,
    setGroupVariables,
    updateRequestSnapshot,
    type ParentId,
    type Workspace,
    type WorkspaceResult,
} from '../core/workspace';
import { Emitter } from '../utils/Emitter';
import type { SecretStore } from './SecretStore';

export interface WorkspaceChange {
    removedIds: string[];
}

export interface WorkspaceLoad {
    workspace: Workspace;
    repairs: string[];
    unreadable: string[];
}

export interface WorkspacePersistence {
    load(): Promise<WorkspaceLoad>;
    save(workspace: Workspace): Promise<void>;
}

export class WorkspaceService {
    private state: Workspace = createWorkspace();
    private readonly changeEmitter = new Emitter<WorkspaceChange>();
    private readonly secretFailureEmitter = new Emitter<void>();

    readonly onDidChange = this.changeEmitter.event;
    readonly onSecretsUnavailable = this.secretFailureEmitter.event;

    loadRepairs: string[] = [];
    unreadableFiles: string[] = [];

    constructor(
        private readonly persistence: WorkspacePersistence,
        private readonly secrets?: SecretStore
    ) {}

    static async open(
        persistence: WorkspacePersistence,
        secrets?: SecretStore
    ): Promise<WorkspaceService> {
        const service = new WorkspaceService(persistence, secrets);

        await service.reload();

        return service;
    }

    get workspace(): Workspace {
        return this.state;
    }

    async reload(): Promise<void> {
        const { workspace, repairs, unreadable } = await this.persistence.load();

        this.loadRepairs = repairs;
        this.unreadableFiles = unreadable;

        if (!this.secrets) {
            this.state = workspace;
            this.changeEmitter.fire({ removedIds: [] });

            return;
        }

        const exposed = collectSecrets(workspace);
        const vault = await this.secrets.readWorkspace();

        this.state = restoreWorkspace(workspace, { ...vault, ...exposed });

        if (Object.keys(exposed).length > 0) {
            await this.secrets.writeWorkspace(collectSecrets(this.state));
            await this.persistence.save(redactWorkspace(this.state));
        }

        this.changeEmitter.fire({ removedIds: [] });
    }

    dispose(): void {
        this.changeEmitter.dispose();
        this.secretFailureEmitter.dispose();
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

    async setVariables(id: string, variables: Variable[]): Promise<WorkspaceResult> {
        return this.apply(setGroupVariables(this.state, id, variables));
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

    async clear(): Promise<void> {
        const removedIds = Object.keys(this.state.nodes);

        await this.commit(createWorkspace(), removedIds);
    }

    private async apply(result: WorkspaceResult): Promise<WorkspaceResult> {
        if (result.ok) {
            await this.commit(result.workspace, []);
        }

        return result;
    }

    private async commit(next: Workspace, removedIds: string[]): Promise<void> {
        this.state = next;

        if (this.secrets) {
            const vaulted = await this.secrets.writeWorkspace(collectSecrets(next));

            if (!vaulted && Object.keys(collectSecrets(next)).length > 0) {
                this.secretFailureEmitter.fire();
            }
        }

        await this.persistence.save(this.secrets ? redactWorkspace(next) : next);
        this.changeEmitter.fire({ removedIds });
    }
}
