import * as vscode from 'vscode';
import { type Environment, type Variable } from '../core/variables';
import { slugify } from './CollectionStore';

export const ENVIRONMENT_FILE_VERSION = 1;

const PREFIX = 'environment_';

const FILE_SUFFIX = '.json';

export interface EnvironmentDocument {
    reqly: number;
    order: number;
    environment: Environment;
}

export interface EnvironmentLoad {
    environments: Environment[];
    unreadable: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEnvironment(raw: unknown): { environment: Environment; order: number } | null {
    if (!isRecord(raw) || !isRecord(raw.environment)) {
        return null;
    }

    const source = raw.environment;

    if (typeof source.id !== 'string' || !source.id) {
        return null;
    }

    const createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now();
    const variables = Array.isArray(source.variables) ? source.variables : [];

    return {
        order: typeof raw.order === 'number' ? raw.order : 0,
        environment: {
            id: source.id,
            name: typeof source.name === 'string' && source.name ? source.name : 'Environment',
            createdAt,
            updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : createdAt,
            variables: variables.filter(isRecord).map(toVariable),
        },
    };
}

function toVariable(raw: Record<string, unknown>, index: number): Variable {
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `v${index}`,
        key: typeof raw.key === 'string' ? raw.key : '',
        value: typeof raw.value === 'string' ? raw.value : '',
        enabled: raw.enabled !== false,
        secret: raw.secret === true,
    };
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

                const document = parseEnvironment(JSON.parse(text));

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
            const document: EnvironmentDocument = {
                reqly: ENVIRONMENT_FILE_VERSION,
                order: index,
                environment,
            };

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
