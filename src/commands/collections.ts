import * as vscode from 'vscode';
import { childIdsOf, getNode, isGroup, type ParentId, type Workspace } from '../core/workspace';

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
