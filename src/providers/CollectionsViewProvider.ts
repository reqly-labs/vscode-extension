import * as vscode from 'vscode';
import type {
    CollectionsHostMessage,
    CollectionsViewMessage,
    TreeRow,
    TreeStats,
} from '../core/collectionsMessages';
import {
    childIdsOf,
    getNode,
    isGroup,
    isRequest,
    parentOf,
    requestLabel,
    type ParentId,
    type Workspace,
} from '../core/workspace';
import type { WorkspaceService } from '../services/WorkspaceService';
import { createNonce } from '../utils/nonce';
import { renderCollectionsPage } from './collectionsPage';
const EXPANDED_KEY = 'reqly.expandedNodes';
const REPOSITORY_URL = 'https://github.com/reqly-labs';
const MAX_DEPTH = 64;
export interface CollectionsViewCallbacks {
    openRequest: (id: string) => Promise<void>;
    activeRequestId: () => string | null;
}
export class CollectionsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'reqly.collections';
    private view: vscode.WebviewView | undefined;
    private expanded: Set<string>;
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly workspaceService: WorkspaceService,
        private readonly memento: vscode.Memento,
        private readonly callbacks: CollectionsViewCallbacks
    ) {
        this.expanded = new Set(memento.get<string[]>(EXPANDED_KEY) ?? []);
    }
    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
        };
        view.webview.html = renderCollectionsPage({
            scriptUri: view.webview
                .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'collections.js'))
                .toString(),
            styleUri: view.webview
                .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'collections.css'))
                .toString(),
            cspSource: view.webview.cspSource,
            nonce: createNonce(),
        });
        view.webview.onDidReceiveMessage((message: CollectionsViewMessage) => this.handle(message));
        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() =>
            this.post({ type: 'theme', theme: themeKind() })
        );
        view.onDidDispose(() => {
            themeSubscription.dispose();
            this.view = undefined;
        });
    }
    refresh(): void {
        this.post({
            type: 'render',
            rows: this.buildRows(),
            stats: this.buildStats(),
            mascotUri: this.mascotUri(),
            theme: themeKind(),
        });
    }
    async revealForRename(id: string): Promise<void> {
        this.expandAncestors(id);
        await this.persistExpanded();
        this.refresh();
        this.post({ type: 'beginRename', id });
    }
    async reveal(id: string): Promise<void> {
        this.expandAncestors(id);
        await this.persistExpanded();
        this.refresh();
    }
    private post(message: CollectionsHostMessage): void {
        void this.view?.webview.postMessage(message);
    }
    private get workspace(): Workspace {
        return this.workspaceService.workspace;
    }
    private expandAncestors(id: string): void {
        let parent = parentOf(this.workspace, id);
        let depth = 0;
        while (parent && depth < MAX_DEPTH) {
            this.expanded.add(parent);
            parent = parentOf(this.workspace, parent);
            depth += 1;
        }
    }
    private async persistExpanded(): Promise<void> {
        const live = [...this.expanded].filter((id) => isGroup(getNode(this.workspace, id)));
        this.expanded = new Set(live);
        await this.memento.update(EXPANDED_KEY, live);
    }
    private mascotUri(): string {
        if (!this.view) {
            return '';
        }
        return this.view.webview
            .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot.png'))
            .toString();
    }
    private buildStats(): TreeStats {
        let collections = 0;
        let requests = 0;
        for (const node of Object.values(this.workspace.nodes)) {
            if (node.kind === 'collection') {
                collections += 1;
            } else if (node.kind === 'request') {
                requests += 1;
            }
        }
        return { collections, requests };
    }
    private buildRows(): TreeRow[] {
        const rows: TreeRow[] = [];
        const workspace = this.workspace;
        const activeId = this.callbacks.activeRequestId();
        const walk = (parentId: ParentId, depth: number) => {
            if (depth > MAX_DEPTH) {
                return;
            }
            for (const id of childIdsOf(workspace, parentId)) {
                const node = getNode(workspace, id);
                if (!node) {
                    continue;
                }
                const group = isGroup(node);
                const expanded = group && this.expanded.has(id);
                rows.push({
                    id,
                    kind: node.kind,
                    name: isRequest(node) ? requestLabel(node) : node.name,
                    depth,
                    hasChildren: group && node.childIds.length > 0,
                    expanded,
                    childCount: group ? node.childIds.length : 0,
                    method: isRequest(node) ? node.snapshot.method : undefined,
                    url: isRequest(node) ? node.snapshot.url : undefined,
                    isActive: id === activeId,
                });
                if (expanded) {
                    walk(id, depth + 1);
                }
            }
        };
        walk(null, 0);
        return rows;
    }
    private resolveDrop(targetId: string | null): {
        parentId: ParentId;
        index?: number;
    } {
        if (!targetId) {
            return { parentId: null };
        }
        const node = getNode(this.workspace, targetId);
        if (isGroup(node)) {
            return { parentId: node.id };
        }
        const parentId = parentOf(this.workspace, targetId) ?? null;
        return { parentId, index: childIdsOf(this.workspace, parentId).indexOf(targetId) };
    }
    private async handle(message: CollectionsViewMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                this.refresh();
                break;
            case 'open':
                await this.callbacks.openRequest(message.id);
                break;
            case 'toggle':
                if (this.expanded.has(message.id)) {
                    this.expanded.delete(message.id);
                } else {
                    this.expanded.add(message.id);
                }
                await this.persistExpanded();
                this.refresh();
                break;
            case 'newCollection':
                await this.createCollection();
                break;
            case 'newFolder':
                this.expanded.add(message.id);
                await this.create(() =>
                    this.workspaceService.createFolder(message.id, 'New Folder')
                );
                break;
            case 'newRequest':
                await this.createRequest(message.id);
                break;
            case 'rename': {
                const result = await this.workspaceService.rename(message.id, message.name);
                if (!result.ok) {
                    void vscode.window.showWarningMessage(result.reason);
                    this.refresh();
                }
                break;
            }
            case 'duplicate': {
                const result = await this.workspaceService.duplicate(message.id);
                if (!result.ok) {
                    void vscode.window.showWarningMessage(result.reason);
                    return;
                }
                await this.reveal(result.id);
                break;
            }
            case 'delete':
                await this.confirmDelete(message.id);
                break;
            case 'openRepository':
                await vscode.env.openExternal(vscode.Uri.parse(REPOSITORY_URL));
                break;
            case 'move': {
                const destination = this.resolveDrop(message.targetId);
                const result = await this.workspaceService.move(
                    message.id,
                    destination.parentId,
                    destination.index
                );
                if (!result.ok) {
                    void vscode.window.showWarningMessage(result.reason);
                    this.refresh();
                }
                break;
            }
        }
    }
    async createCollection(): Promise<void> {
        await this.ensureVisible();
        await this.create(() => this.workspaceService.createCollection('New Collection'));
    }
    async createRequest(parentId: ParentId): Promise<void> {
        await this.ensureVisible();
        if (parentId) {
            this.expanded.add(parentId);
        }
        const result = await this.workspaceService.createRequest(parentId, 'New Request');
        if (!result.ok) {
            void vscode.window.showWarningMessage(result.reason);
            return;
        }
        await this.revealForRename(result.id);
        await this.callbacks.openRequest(result.id);
    }

    private async ensureVisible(): Promise<void> {
        if (this.view) {
            return;
        }
        try {
            await vscode.commands.executeCommand(`${CollectionsViewProvider.viewType}.focus`);
        } catch {
            return;
        }
    }
    private async create(
        run: () => Promise<{
            ok: boolean;
            id?: string;
            reason?: string;
        }>
    ): Promise<void> {
        const result = await run();
        if (!result.ok || !result.id) {
            void vscode.window.showWarningMessage(result.reason ?? 'Could not create that item.');
            return;
        }
        await this.revealForRename(result.id);
    }
    private async confirmDelete(id: string): Promise<void> {
        const node = getNode(this.workspace, id);
        if (!node) {
            return;
        }
        const inside = isGroup(node) ? countDescendants(this.workspace, id) : 0;
        const confirmation = await vscode.window.showWarningMessage(
            `Delete "${node.name}"?`,
            {
                modal: true,
                detail:
                    inside > 0
                        ? `This also deletes ${inside} item${inside === 1 ? '' : 's'} inside it.`
                        : undefined,
            },
            'Delete'
        );
        if (confirmation !== 'Delete') {
            return;
        }
        const result = await this.workspaceService.remove(id);
        if (!result.ok) {
            void vscode.window.showWarningMessage(result.reason);
        }
    }
}
function countDescendants(workspace: Workspace, id: string): number {
    const node = getNode(workspace, id);
    if (!isGroup(node)) {
        return 0;
    }
    return node.childIds.reduce(
        (total, childId) => total + 1 + countDescendants(workspace, childId),
        0
    );
}
function themeKind(): 'light' | 'dark' {
    const { kind } = vscode.window.activeColorTheme;
    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';
}
