import * as vscode from 'vscode';
import {
    documentKind,
    mergeDocuments,
    parseDocument,
    rootDocuments,
    type CollectionDocument,
    type ParsedDocument,
} from '../core/collectionFile';
import { getNode, type Workspace } from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';

export const WORKSPACE_FOLDER_NAME = '.reqly';

export const GLOBAL_FOLDER_NAME = 'collections';

const FILE_SUFFIX = '.json';

const OWNED_PREFIXES = ['collection_', 'request_'];

const MAX_SLUG_LENGTH = 48;

export interface StoreLoad {
    workspace: Workspace;
    repairs: string[];
    unreadable: string[];
}

export function slugify(name: string): string {
    const slug = name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SLUG_LENGTH);

    return slug || 'untitled';
}

export function fileNameFor(kind: 'collection' | 'request', name: string, id: string): string {
    return `${kind}_${slugify(name)}_${id.slice(0, 8)}${FILE_SUFFIX}`;
}

export class CollectionStore {
    private watcher: vscode.FileSystemWatcher | undefined;
    private written = new Map<string, string>();
    private readonly externalEmitter = new vscode.EventEmitter<void>();

    readonly onDidChangeExternally = this.externalEmitter.event;

    constructor(private readonly root: vscode.Uri) {}

    get location(): vscode.Uri {
        return this.root;
    }

    dispose(): void {
        this.watcher?.dispose();
        this.externalEmitter.dispose();
    }

    async load(): Promise<StoreLoad> {
        const parsed: ParsedDocument[] = [];
        const unreadable: string[] = [];

        for (const [name] of await this.listFiles()) {
            const uri = vscode.Uri.joinPath(this.root, name);

            try {
                const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

                this.written.set(name, text);

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
        const documents = rootDocuments(workspace);
        const wanted = new Map<string, CollectionDocument>();

        for (const document of documents) {
            const node = getNode(workspace, document.node.id);

            if (!node) {
                continue;
            }

            wanted.set(fileNameFor(documentKind(node), node.name, node.id), document);
        }

        await this.ensureRoot();

        for (const [name, document] of wanted) {
            const text = `${JSON.stringify(document, null, 4)}\n`;

            if (this.written.get(name) === text) {
                continue;
            }

            await vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(this.root, name),
                new TextEncoder().encode(text)
            );
            this.written.set(name, text);
        }

        for (const [name] of await this.listFiles()) {
            if (wanted.has(name)) {
                continue;
            }

            await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.root, name));
            this.written.delete(name);
        }
    }

    watch(): void {
        this.watcher?.dispose();
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.root, `{collection_,request_}*${FILE_SUFFIX}`)
        );

        const react = (uri: vscode.Uri) => void this.reactTo(uri);

        this.watcher.onDidCreate(react);
        this.watcher.onDidChange(react);
        this.watcher.onDidDelete(react);
    }

    private async reactTo(uri: vscode.Uri): Promise<void> {
        const name = uri.path.split('/').pop() ?? '';

        try {
            const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

            if (this.written.get(name) === text) {
                return;
            }
        } catch {
            if (!this.written.has(name)) {
                return;
            }
        }

        this.externalEmitter.fire();
    }

    private async ensureRoot(): Promise<void> {
        await vscode.workspace.fs.createDirectory(this.root);
    }

    private async listFiles(): Promise<[string, vscode.FileType][]> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(this.root);

            return entries.filter(
                ([name, type]) =>
                    type === vscode.FileType.File &&
                    name.endsWith(FILE_SUFFIX) &&
                    OWNED_PREFIXES.some((prefix) => name.startsWith(prefix))
            );
        } catch {
            return [];
        }
    }
}
