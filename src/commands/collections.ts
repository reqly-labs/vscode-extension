import * as vscode from 'vscode';
import {
    DEFAULT_COLLECTION_NAME,
    DEFAULT_FOLDER_NAME,
    DEFAULT_REQUEST_NAME,
    ancestorsOf,
    childIdsOf,
    getGroup,
    getNode,
    isGroup,
    isRequest,
    requestLabel,
    subtreeIds,
    type ParentId,
    type Workspace,
    type WorkspaceResult,
} from '../core/workspace';
import type { WorkspaceService } from '../services/WorkspaceService';

export interface CollectionCommandContext {
    workspaceService: WorkspaceService;
    reveal: (id: string, options?: { expand?: boolean }) => Promise<void>;
    openRequest: (id: string) => Promise<void>;
}

function report(result: WorkspaceResult): boolean {
    if (!result.ok) {
        void vscode.window.showWarningMessage(result.reason);
        return false;
    }

    return true;
}

function resolveTargetId(workspace: Workspace, argument: unknown): string | undefined {
    if (typeof argument !== 'string') {
        return undefined;
    }

    return getNode(workspace, argument) ? argument : undefined;
}

async function promptForName(
    prompt: string,
    value: string,
    takenNames: string[]
): Promise<string | undefined> {
    const normalizedTaken = new Set(takenNames.map((name) => name.trim().toLowerCase()));

    return vscode.window.showInputBox({
        prompt,
        value,
        valueSelection: [0, value.length],
        validateInput: (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                return 'The name cannot be empty.';
            }

            if (trimmed.toLowerCase() !== value.trim().toLowerCase() &&
                normalizedTaken.has(trimmed.toLowerCase())) {
                return 'Something with that name already sits here.';
            }

            return undefined;
        },
    });
}

function siblingNames(workspace: Workspace, parentId: ParentId, exceptId?: string): string[] {
    return childIdsOf(workspace, parentId)
        .filter((id) => id !== exceptId)
        .map((id) => getNode(workspace, id)?.name ?? '')
        .filter(Boolean);
}

function containerFor(workspace: Workspace, targetId: string | undefined): ParentId {
    if (!targetId) {
        return null;
    }

    const node = getNode(workspace, targetId);

    if (isGroup(node)) {
        return node.id;
    }

    const parent = ancestorsOf(workspace, targetId).at(-1);

    return parent?.id ?? null;
}

export function registerCollectionCommands(
    context: CollectionCommandContext
): vscode.Disposable[] {
    const { workspaceService, reveal, openRequest } = context;

    const newCollection = vscode.commands.registerCommand('reqly.newCollection', async () => {
        const workspace = workspaceService.workspace;
        const name = await promptForName(
            'Name for the new collection',
            DEFAULT_COLLECTION_NAME,
            siblingNames(workspace, null)
        );

        if (name === undefined) {
            return;
        }

        const result = await workspaceService.createCollection(name);

        if (report(result) && result.ok) {
            await reveal(result.id, { expand: true });
        }
    });

    const newFolder = vscode.commands.registerCommand(
        'reqly.newFolder',
        async (argument?: unknown) => {
            const workspace = workspaceService.workspace;
            const targetId = resolveTargetId(workspace, argument);
            const parentId = containerFor(workspace, targetId);

            if (parentId === null) {
                void vscode.window.showWarningMessage(
                    'Pick a collection or folder to create the folder inside.'
                );
                return;
            }

            const name = await promptForName(
                'Name for the new folder',
                DEFAULT_FOLDER_NAME,
                siblingNames(workspace, parentId)
            );

            if (name === undefined) {
                return;
            }

            const result = await workspaceService.createFolder(parentId, name);

            if (report(result) && result.ok) {
                await reveal(result.id, { expand: true });
            }
        }
    );

    const newRequest = vscode.commands.registerCommand(
        'reqly.newRequestIn',
        async (argument?: unknown) => {
            const workspace = workspaceService.workspace;
            const targetId = resolveTargetId(workspace, argument);
            const parentId = containerFor(workspace, targetId);

            const name = await promptForName(
                'Name for the new request',
                DEFAULT_REQUEST_NAME,
                siblingNames(workspace, parentId)
            );

            if (name === undefined) {
                return;
            }

            const result = await workspaceService.createRequest(parentId, name);

            if (report(result) && result.ok) {
                await reveal(result.id);
                await openRequest(result.id);
            }
        }
    );

    const rename = vscode.commands.registerCommand('reqly.renameNode', async (argument?: unknown) => {
        const workspace = workspaceService.workspace;
        const targetId = resolveTargetId(workspace, argument);

        if (!targetId) {
            void vscode.window.showWarningMessage('Pick an item in the Collections view to rename.');
            return;
        }

        const node = getNode(workspace, targetId);

        if (!node) {
            return;
        }

        const parentId = ancestorsOf(workspace, targetId).at(-1)?.id ?? null;

        const name = await promptForName(
            `Rename ${node.kind}`,
            node.name,
            siblingNames(workspace, parentId, targetId)
        );

        if (name === undefined || name.trim() === node.name) {
            return;
        }

        report(await workspaceService.rename(targetId, name));
    });

    const duplicate = vscode.commands.registerCommand(
        'reqly.duplicateNode',
        async (argument?: unknown) => {
            const targetId = resolveTargetId(workspaceService.workspace, argument);

            if (!targetId) {
                void vscode.window.showWarningMessage(
                    'Pick an item in the Collections view to duplicate.'
                );
                return;
            }

            const result = await workspaceService.duplicate(targetId);

            if (report(result) && result.ok) {
                await reveal(result.id);
            }
        }
    );

    const remove = vscode.commands.registerCommand('reqly.deleteNode', async (argument?: unknown) => {
        const workspace = workspaceService.workspace;
        const targetId = resolveTargetId(workspace, argument);

        if (!targetId) {
            void vscode.window.showWarningMessage('Pick an item in the Collections view to delete.');
            return;
        }

        const node = getNode(workspace, targetId);

        if (!node) {
            return;
        }

        const affected = subtreeIds(workspace, targetId).length - 1;
        const detail =
            affected > 0
                ? `This also deletes ${affected} item${affected === 1 ? '' : 's'} inside it.`
                : undefined;

        const confirmation = await vscode.window.showWarningMessage(
            `Delete "${node.name}"?`,
            { modal: true, detail },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return;
        }

        report(await workspaceService.remove(targetId));
    });

    const openFromTree = vscode.commands.registerCommand(
        'reqly.openRequest',
        async (argument?: unknown) => {
            const targetId = resolveTargetId(workspaceService.workspace, argument);

            if (!targetId) {
                return;
            }

            await openRequest(targetId);
        }
    );

    return [newCollection, newFolder, newRequest, rename, duplicate, remove, openFromTree];
}

export async function pickContainer(
    workspace: Workspace,
    placeHolder: string
): Promise<ParentId | undefined> {
    interface Choice extends vscode.QuickPickItem {
        id: ParentId;
    }

    const choices: Choice[] = [
        { id: null, label: '$(list-flat) No collection', description: 'Keep it as a loose request' },
    ];

    const walk = (parentId: ParentId, depth: number) => {
        for (const id of childIdsOf(workspace, parentId)) {
            const node = getNode(workspace, id);

            if (!isGroup(node)) {
                continue;
            }

            choices.push({
                id: node.id,
                label: `${'  '.repeat(depth)}$(${node.kind === 'collection' ? 'folder-library' : 'folder'}) ${node.name}`,
            });

            walk(node.id, depth + 1);
        }
    };

    walk(null, 0);

    const picked = await vscode.window.showQuickPick(choices, { placeHolder });

    return picked ? picked.id : undefined;
}

export function describeLocation(workspace: Workspace, id: string): string {
    const trail = ancestorsOf(workspace, id).map((node) => node.name);
    const node = getNode(workspace, id);
    const label = node && isRequest(node) ? requestLabel(node) : (node?.name ?? '');

    return [...trail, label].filter(Boolean).join(' / ');
}

export { getGroup };
