import * as vscode from 'vscode';
import { GLOBAL_FOLDER_NAME, WORKSPACE_FOLDER_NAME } from './CollectionStore';

export type StorageLocation = 'global' | 'workspace';

export function configuredLocation(): StorageLocation {
    return vscode.workspace
        .getConfiguration('reqly')
        .get<StorageLocation>('storage.location', 'global') === 'workspace'
        ? 'workspace'
        : 'global';
}

export function workspaceRoot(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];

    return folder ? vscode.Uri.joinPath(folder.uri, WORKSPACE_FOLDER_NAME) : undefined;
}

export function resolveStorageRoot(context: vscode.ExtensionContext): {
    root: vscode.Uri;
    location: StorageLocation;
} {
    if (configuredLocation() === 'workspace') {
        const root = workspaceRoot();

        if (root) {
            return { root, location: 'workspace' };
        }
    }

    return {
        root: vscode.Uri.joinPath(context.globalStorageUri, GLOBAL_FOLDER_NAME),
        location: 'global',
    };
}
