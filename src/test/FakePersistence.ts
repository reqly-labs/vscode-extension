import { mergeDocuments, parseDocument, rootDocuments } from '../core/collectionFile';
import { normalizeWorkspace } from '../core/workspaceIntegrity';
import { createWorkspace, type Workspace } from '../core/workspace';
import type { WorkspaceLoad, WorkspacePersistence } from '../services/WorkspaceService';

export class FakePersistence implements WorkspacePersistence {
    private files = new Map<string, string>();

    saves = 0;

    constructor(seed?: Workspace) {
        if (seed) {
            this.writeAll(seed);
        }
    }

    get fileNames(): string[] {
        return [...this.files.keys()].sort();
    }

    get contents(): string {
        return [...this.files.values()].join('|');
    }

    get bytesWritten(): number {
        return [...this.files.values()].reduce((total, text) => total + text.length, 0);
    }

    async load(): Promise<WorkspaceLoad> {
        const parsed = [];
        const unreadable: string[] = [];

        for (const [name, text] of this.files) {
            try {
                const document = parseDocument(JSON.parse(text));

                if (document) {
                    parsed.push(document);
                } else {
                    unreadable.push(name);
                }
            } catch {
                unreadable.push(name);
            }
        }

        const { workspace, repairs } = normalizeWorkspace(mergeDocuments(parsed));

        return { workspace, repairs, unreadable };
    }

    async save(workspace: Workspace): Promise<void> {
        this.saves += 1;
        this.writeAll(workspace);
    }

    corrupt(name: string): void {
        this.files.set(name, '{ not json');
    }

    seedRaw(name: string, document: unknown): void {
        this.files.set(name, JSON.stringify(document));
    }

    private writeAll(workspace: Workspace): void {
        this.files = new Map(
            rootDocuments(workspace).map((document) => [
                document.node.id,
                JSON.stringify(document, null, 4),
            ])
        );
    }
}

export function emptyWorkspace(): Workspace {
    return createWorkspace();
}
