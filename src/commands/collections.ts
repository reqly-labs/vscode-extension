import * as vscode from 'vscode';
import {
    DEFAULT_COLLECTION_NAME,
    DEFAULT_REQUEST_NAME,
    ancestorsOf,
    childIdsOf,
    getNode,
    isGroup,
    isRequest,
    requestLabel,
    type ParentId,
    type Workspace,
    type WorkspaceResult,
} from '../core/workspace';
import type { WorkspaceService } from '../services/WorkspaceService';

export interface CollectionCommandContext {
    workspaceService: WorkspaceService;
    reveal: (id: string) => Promise<void>;
    openRequest: (id: string) => Promise<void>;
}

function report(result: WorkspaceResult): boolean {
    if (!result.ok) {
        void vscode.window.showWarningMessage(result.reason);
        return false;
    }

    return true;
}

function siblingNames(workspace: Workspace, parentId: ParentId): string[] {
    return childIdsOf(workspace, parentId)
        .map((id) => getNode(workspace, id)?.name ?? '')
        .filter(Boolean);
}

async function promptForName(
    prompt: string,
    value: string,
    takenNames: string[]
): Promise<string | undefined> {
    const taken = new Set(takenNames.map((name) => name.trim().toLowerCase()));

    return vscode.window.showInputBox({
        prompt,
        value,
        valueSelection: [0, value.length],
        validateInput: (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                return 'The name cannot be empty.';
            }

            if (taken.has(trimmed.toLowerCase())) {
                return 'Something with that name already sits here.';
            }

            return undefined;
        },
    });
}

/**
 * Only the two entry points that make sense without a tree selection live
 * here. Everything else (rename, duplicate, delete, new folder) is driven from
 * the sidebar's own context menu, where there is always a target row.
 */
export function registerCollectionCommands(context: CollectionCommandContext): vscode.Disposable[] {
    const { workspaceService, reveal, openRequest } = context;

    const newCollection = vscode.commands.registerCommand('reqly.newCollection', async () => {
        const name = await promptForName(
            'Name for the new collection',
            DEFAULT_COLLECTION_NAME,
            siblingNames(workspaceService.workspace, null)
        );

        if (name === undefined) {
            return;
        }

        const result = await workspaceService.createCollection(name);

        if (report(result) && result.ok) {
            await reveal(result.id);
        }
    });

    const newRequestIn = vscode.commands.registerCommand('reqly.newRequestIn', async () => {
        const parentId = await pickContainer(
            workspaceService.workspace,
            'Create the request where?'
        );

        if (parentId === undefined) {
            return;
        }

        const name = await promptForName(
            'Name for the new request',
            DEFAULT_REQUEST_NAME,
            siblingNames(workspaceService.workspace, parentId)
        );

        if (name === undefined) {
            return;
        }

        const result = await workspaceService.createRequest(parentId, name);

        if (report(result) && result.ok) {
            await reveal(result.id);
            await openRequest(result.id);
        }
    });

    return [newCollection, newRequestIn];
}

/** Lets the user choose a destination group, used by "Save to collection". */
export async function pickContainer(
    workspace: Workspace,
    placeHolder: string
): Promise<ParentId | undefined> {
    interface Choice extends vscode.QuickPickItem {
        id: ParentId;
    }

    const choices: Choice[] = [
        {
            id: null,
            label: '$(list-flat) No collection',
            description: 'Keep it as a loose request',
        },
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

/** Human-readable location of a node, for panel breadcrumbs and messages. */
export function describeLocation(workspace: Workspace, id: string): string {
    const trail = ancestorsOf(workspace, id).map((node) => node.name);
    const node = getNode(workspace, id);
    const label = node && isRequest(node) ? requestLabel(node) : (node?.name ?? '');

    return [...trail, label].filter(Boolean).join(' / ');
}
