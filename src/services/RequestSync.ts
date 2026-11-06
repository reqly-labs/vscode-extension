import { sameValue } from '../core/equal';
import type { RequestSnapshot } from '../core/types';
import { getRequest } from '../core/workspace';
import type { WorkspaceService } from './WorkspaceService';

export type SaveMode = 'auto' | 'manual';

export interface RequestSyncHost {
    activeId(): string | null;
    autoSave(): boolean;
    saved(snapshot: RequestSnapshot): void;
    reload(snapshot: RequestSnapshot): Promise<void>;
    conflict(): Promise<boolean>;
    lost(snapshot: RequestSnapshot, reason: string): Promise<void>;
}

export class RequestSync {
    private queue: Promise<unknown> = Promise.resolve();
    private synced: RequestSnapshot | null = null;
    private panel: RequestSnapshot | null = null;

    constructor(
        private readonly workspace: WorkspaceService,
        private readonly host: RequestSyncHost
    ) {}

    stored(): RequestSnapshot | null {
        const id = this.host.activeId();
        const node = id ? getRequest(this.workspace.workspace, id) : undefined;

        return node ? structuredClone(node.snapshot) : null;
    }

    track(snapshot: RequestSnapshot | null): void {
        this.synced = snapshot ? structuredClone(snapshot) : null;
        this.panel = snapshot ? structuredClone(snapshot) : null;
    }

    showing(snapshot: RequestSnapshot): void {
        this.panel = structuredClone(snapshot);
    }

    forget(): void {
        this.synced = null;
    }

    async idle(): Promise<void> {
        await this.queue.catch(() => undefined);
    }

    async edited(id: string, snapshot: RequestSnapshot): Promise<void> {
        this.panel = structuredClone(snapshot);
        if (this.host.autoSave()) {
            await this.save(id, snapshot, 'auto');
        }
    }

    async autoSaveTurnedOn(): Promise<void> {
        const id = this.host.activeId();

        if (id && this.panel && this.host.autoSave()) {
            await this.save(id, this.panel, 'auto');
        }
    }

    save(id: string, snapshot: RequestSnapshot, mode: SaveMode): Promise<boolean> {
        const run = this.queue
            .catch(() => undefined)
            .then(() => this.write(id, structuredClone(snapshot), mode));

        this.queue = run;

        return run;
    }

    async diskChanged(): Promise<void> {
        await this.idle();

        const stored = this.stored();

        if (!stored || !this.synced || sameValue(stored, this.synced)) {
            return;
        }

        const editedHere = this.panel !== null && !sameValue(this.panel, this.synced);
        const id = this.host.activeId();

        this.synced = structuredClone(stored);
        if (editedHere && !(await this.host.conflict())) {
            return;
        }

        if (id === null || this.host.activeId() !== id) {
            return;
        }

        const latest = this.stored();

        if (latest) {
            this.track(latest);
            await this.host.reload(latest);
        }
    }

    private async write(id: string, snapshot: RequestSnapshot, mode: SaveMode): Promise<boolean> {
        const node = getRequest(this.workspace.workspace, id);
        const active = () => this.host.activeId() === id;

        if (!node) {
            if (mode === 'manual' && active()) {
                await this.host.lost(snapshot, 'That request no longer exists.');
            }

            return false;
        }

        if (!sameValue(node.snapshot, snapshot)) {
            if (active()) {
                this.synced = structuredClone(snapshot);
            }

            const result = await this.workspace.updateSnapshot(id, snapshot);

            if (!result.ok) {
                if (mode === 'manual' && active()) {
                    await this.host.lost(snapshot, result.reason);
                }

                return false;
            }
        }

        if (active()) {
            this.host.saved(snapshot);
        }

        return true;
    }
}
