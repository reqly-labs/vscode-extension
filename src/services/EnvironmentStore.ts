import * as vscode from 'vscode';
import {
    parseEnvironmentDocument,
    toEnvironmentDocument,
    type EnvironmentDocument,
} from '../core/environmentFile';
import { type Environment } from '../core/variables';
import { slugify } from './CollectionStore';

const PREFIX = 'environment_';

const FILE_SUFFIX = '.json';

export interface EnvironmentLoad {
    environments: Environment[];
    unreadable: string[];
}

export function environmentFileName(environment: Environment): string {
    return `${PREFIX}${slugify(environment.name)}_${environment.id.slice(0, 8)}${FILE_SUFFIX}`;
}

export class EnvironmentStore {
    private watcher: vscode.FileSystemWatcher | undefined;
    private written = new Map<string, string>();
    private readonly externalEmitter = new vscode.EventEmitter<void>();

    readonly onDidChangeExternally = this.externalEmitter.event;

    constructor(private readonly root: vscode.Uri) {}

    dispose(): void {
        this.watcher?.dispose();
        this.externalEmitter.dispose();
    }

    async load(): Promise<EnvironmentLoad> {
        const parsed: { environment: Environment; order: number }[] = [];
        const unreadable: string[] = [];

        for (const name of await this.listFiles()) {
            const uri = vscode.Uri.joinPath(this.root, name);

            try {
                const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

                this.written.set(name, text);

                const document = parseEnvironmentDocument(JSON.parse(text));

                if (document) {
                    parsed.push(document);
                } else {
                    unreadable.push(name);
                }
            } catch {
                unreadable.push(name);
            }
        }

        parsed.sort(
            (a, b) => a.order - b.order || a.environment.name.localeCompare(b.environment.name)
        );

        return { environments: parsed.map((entry) => entry.environment), unreadable };
    }

    async save(environments: readonly Environment[]): Promise<void> {
        const wanted = new Map<string, string>();

        environments.forEach((environment, index) => {
            const document: EnvironmentDocument = toEnvironmentDocument(environment, index);

            wanted.set(environmentFileName(environment), `${JSON.stringify(document, null, 4)}\n`);
        });

        if (wanted.size > 0) {
            await vscode.workspace.fs.createDirectory(this.root);
        }

        for (const [name, text] of wanted) {
            if (this.written.get(name) === text) {
                continue;
            }

            await vscode.workspace.fs.writeFile(
                vscode.Uri.joinPath(this.root, name),
                new TextEncoder().encode(text)
            );
            this.written.set(name, text);
        }

        for (const name of await this.listFiles()) {
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
            new vscode.RelativePattern(this.root, `${PREFIX}*${FILE_SUFFIX}`)
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

    private async listFiles(): Promise<string[]> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(this.root);

            return entries
                .filter(
                    ([name, type]) =>
                        type === vscode.FileType.File &&
                        name.startsWith(PREFIX) &&
                        name.endsWith(FILE_SUFFIX)
                )
                .map(([name]) => name);
        } catch {
            return [];
        }
    }
}
