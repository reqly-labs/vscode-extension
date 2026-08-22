import * as vscode from 'vscode';
import type { HttpMethod } from '../core/types';
import {
    childIdsOf,
    getNode,
    isGroup,
    parentOf,
    requestLabel,
    type Workspace,
} from '../core/workspace';
import type { WorkspaceService } from '../services/WorkspaceService';

const METHOD_COLORS: Record<HttpMethod, string> = {
    GET: 'charts.green',
    POST: 'charts.yellow',
    PUT: 'charts.blue',
    PATCH: 'charts.purple',
    DELETE: 'charts.red',
    HEAD: 'charts.foreground',
    OPTIONS: 'charts.foreground',
};

const MIME_TYPE = 'application/vnd.code.tree.reqlycollections';

export class CollectionsTreeProvider
    implements vscode.TreeDataProvider<string>, vscode.TreeDragAndDropController<string>
{
    public static readonly viewType = 'reqly.collections';

    readonly dropMimeTypes = [MIME_TYPE];
    readonly dragMimeTypes = [MIME_TYPE];

    private readonly changeEmitter = new vscode.EventEmitter<string | undefined | void>();

    readonly onDidChangeTreeData = this.changeEmitter.event;

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly activeRequestId: () => string | null
    ) {}

    refresh(): void {
        this.changeEmitter.fire();
    }

    private get workspace(): Workspace {
        return this.workspaceService.workspace;
    }

    getChildren(id?: string): string[] {
        return childIdsOf(this.workspace, id ?? null);
    }

    getParent(id: string): string | undefined {
        const parent = parentOf(this.workspace, id);
        return parent ?? undefined;
    }

    getTreeItem(id: string): vscode.TreeItem {
        const node = getNode(this.workspace, id);

        if (!node) {
            return new vscode.TreeItem('(removed)', vscode.TreeItemCollapsibleState.None);
        }

        if (isGroup(node)) {
            const item = new vscode.TreeItem(
                node.name,
                vscode.TreeItemCollapsibleState.Collapsed
            );

            item.id = node.id;
            item.contextValue = node.kind;
            item.iconPath = new vscode.ThemeIcon(
                node.kind === 'collection' ? 'folder-library' : 'folder'
            );

            const count = node.childIds.length;
            item.description = count > 0 ? String(count) : undefined;
            item.tooltip = node.kind === 'collection' ? 'Collection' : 'Folder';

            return item;
        }

        const item = new vscode.TreeItem(requestLabel(node), vscode.TreeItemCollapsibleState.None);
        const method = node.snapshot.method;

        item.id = node.id;
        item.contextValue = 'request';
        item.description = method;
        item.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor(METHOD_COLORS[method] ?? 'charts.foreground')
        );

        item.tooltip = new vscode.MarkdownString(
            `**${method}** ${node.snapshot.url || '_no URL yet_'}`
        );

        item.command = {
            command: 'reqly.openRequest',
            title: 'Open Request',
            arguments: [node.id],
        };

        if (node.id === this.activeRequestId()) {
            item.description = `${method} • open`;
        }

        return item;
    }

    handleDrag(source: readonly string[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem([...source]));
    }

    async handleDrop(target: string | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferred = dataTransfer.get(MIME_TYPE)?.value;
        const draggedIds: string[] = Array.isArray(transferred) ? transferred : [];

        if (draggedIds.length === 0) {
            return;
        }

        const destination = this.resolveDropTarget(target);

        for (const draggedId of draggedIds) {
            const result = await this.workspaceService.move(
                draggedId,
                destination.parentId,
                destination.index
            );

            if (!result.ok) {
                void vscode.window.showWarningMessage(result.reason);
                return;
            }
        }
    }

    private resolveDropTarget(target: string | undefined): {
        parentId: string | null;
        index?: number;
    } {
        if (!target) {
            return { parentId: null };
        }

        const node = getNode(this.workspace, target);

        if (isGroup(node)) {
            return { parentId: node.id };
        }

        const parentId = parentOf(this.workspace, target) ?? null;
        const siblings = childIdsOf(this.workspace, parentId);

        return { parentId, index: siblings.indexOf(target) };
    }
}
