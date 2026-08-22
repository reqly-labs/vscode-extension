import { createSnapshot, type RequestSnapshot } from './types';
export type NodeKind = 'collection' | 'folder' | 'request';
export type ParentId = string | null;
interface NodeBase {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}
export interface GroupNode extends NodeBase {
    kind: 'collection' | 'folder';
    childIds: string[];
}
export interface RequestNode extends NodeBase {
    kind: 'request';
    snapshot: RequestSnapshot;
}
export type WorkspaceNode = GroupNode | RequestNode;
export interface Workspace {
    nodes: Record<string, WorkspaceNode>;
    rootIds: string[];
}
export const DEFAULT_COLLECTION_NAME = 'New Collection';
export const DEFAULT_FOLDER_NAME = 'New Folder';
export const DEFAULT_REQUEST_NAME = 'New Request';
const MAX_DEPTH = 64;
export function createWorkspace(): Workspace {
    return { nodes: {}, rootIds: [] };
}
export function createNodeId(): string {
    const source = globalThis.crypto;
    if (source && typeof source.randomUUID === 'function') {
        return source.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}
export function isGroup(node: WorkspaceNode | undefined): node is GroupNode {
    return node?.kind === 'collection' || node?.kind === 'folder';
}
export function isRequest(node: WorkspaceNode | undefined): node is RequestNode {
    return node?.kind === 'request';
}
export function getNode(workspace: Workspace, id: string): WorkspaceNode | undefined {
    return workspace.nodes[id];
}
export function getGroup(workspace: Workspace, id: string): GroupNode | undefined {
    const node = workspace.nodes[id];
    return isGroup(node) ? node : undefined;
}
export function getRequest(workspace: Workspace, id: string): RequestNode | undefined {
    const node = workspace.nodes[id];
    return isRequest(node) ? node : undefined;
}
export function childIdsOf(workspace: Workspace, parentId: ParentId): string[] {
    if (parentId === null) {
        return workspace.rootIds;
    }
    return getGroup(workspace, parentId)?.childIds ?? [];
}
export function childrenOf(workspace: Workspace, parentId: ParentId): WorkspaceNode[] {
    return childIdsOf(workspace, parentId)
        .map((id) => workspace.nodes[id])
        .filter((node): node is WorkspaceNode => Boolean(node));
}
export function buildParentIndex(workspace: Workspace): Map<string, ParentId> {
    const index = new Map<string, ParentId>();
    for (const id of workspace.rootIds) {
        index.set(id, null);
    }
    for (const node of Object.values(workspace.nodes)) {
        if (!isGroup(node)) {
            continue;
        }
        for (const childId of node.childIds) {
            index.set(childId, node.id);
        }
    }
    return index;
}
export function parentOf(workspace: Workspace, id: string): ParentId | undefined {
    if (workspace.rootIds.includes(id)) {
        return null;
    }
    for (const node of Object.values(workspace.nodes)) {
        if (isGroup(node) && node.childIds.includes(id)) {
            return node.id;
        }
    }
    return undefined;
}
export function subtreeIds(workspace: Workspace, id: string): string[] {
    const collected: string[] = [];
    const seen = new Set<string>();
    const walk = (current: string, depth: number) => {
        if (depth > MAX_DEPTH || seen.has(current)) {
            return;
        }
        seen.add(current);
        collected.push(current);
        const node = workspace.nodes[current];
        if (isGroup(node)) {
            for (const childId of node.childIds) {
                walk(childId, depth + 1);
            }
        }
    };
    walk(id, 0);
    return collected;
}
export function ancestorsOf(workspace: Workspace, id: string): GroupNode[] {
    const index = buildParentIndex(workspace);
    const chain: GroupNode[] = [];
    let parentId = index.get(id) ?? null;
    let depth = 0;
    while (parentId !== null && depth < MAX_DEPTH) {
        const parent = getGroup(workspace, parentId);
        if (!parent) {
            break;
        }
        chain.unshift(parent);
        parentId = index.get(parent.id) ?? null;
        depth += 1;
    }
    return chain;
}
export type WorkspaceResult =
    | {
          ok: true;
          workspace: Workspace;
          id: string;
      }
    | {
          ok: false;
          reason: string;
      };
export type DeleteResult =
    | {
          ok: true;
          workspace: Workspace;
          removedIds: string[];
      }
    | {
          ok: false;
          reason: string;
      };
function cleanName(name: string, fallback: string): string {
    return name.trim() || fallback;
}
function withNodes(workspace: Workspace, nodes: Record<string, WorkspaceNode>): Workspace {
    return { nodes, rootIds: workspace.rootIds };
}
function insertAt(list: string[], id: string, index?: number): string[] {
    const next = [...list];
    const position = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
    next.splice(position, 0, id);
    return next;
}
function attach(workspace: Workspace, id: string, parentId: ParentId, index?: number): Workspace {
    if (parentId === null) {
        return { nodes: workspace.nodes, rootIds: insertAt(workspace.rootIds, id, index) };
    }
    const parent = getGroup(workspace, parentId);
    if (!parent) {
        return workspace;
    }
    return withNodes(workspace, {
        ...workspace.nodes,
        [parent.id]: {
            ...parent,
            childIds: insertAt(parent.childIds, id, index),
            updatedAt: Date.now(),
        },
    });
}
function detach(workspace: Workspace, id: string): Workspace {
    let result: Workspace = {
        nodes: workspace.nodes,
        rootIds: workspace.rootIds.filter((rootId) => rootId !== id),
    };
    for (const node of Object.values(workspace.nodes)) {
        if (!isGroup(node) || !node.childIds.includes(id)) {
            continue;
        }
        result = withNodes(result, {
            ...result.nodes,
            [node.id]: {
                ...node,
                childIds: node.childIds.filter((childId) => childId !== id),
                updatedAt: Date.now(),
            },
        });
    }
    return result;
}
function validateParent(
    workspace: Workspace,
    kind: NodeKind,
    parentId: ParentId
): string | undefined {
    if (kind === 'collection') {
        return parentId === null ? undefined : 'Collections can only live at the top level.';
    }
    if (parentId === null) {
        return kind === 'folder' ? 'Folders must live inside a collection.' : undefined;
    }
    return getGroup(workspace, parentId)
        ? undefined
        : 'The destination is not a collection or folder.';
}
export function createCollection(workspace: Workspace, name: string): WorkspaceResult {
    const id = createNodeId();
    const now = Date.now();
    const node: GroupNode = {
        id,
        kind: 'collection',
        name: cleanName(name, DEFAULT_COLLECTION_NAME),
        childIds: [],
        createdAt: now,
        updatedAt: now,
    };
    const seeded = withNodes(workspace, { ...workspace.nodes, [id]: node });
    return { ok: true, workspace: attach(seeded, id, null), id };
}
export function createFolder(
    workspace: Workspace,
    parentId: string,
    name: string
): WorkspaceResult {
    const problem = validateParent(workspace, 'folder', parentId);
    if (problem) {
        return { ok: false, reason: problem };
    }
    const id = createNodeId();
    const now = Date.now();
    const node: GroupNode = {
        id,
        kind: 'folder',
        name: cleanName(name, DEFAULT_FOLDER_NAME),
        childIds: [],
        createdAt: now,
        updatedAt: now,
    };
    const seeded = withNodes(workspace, { ...workspace.nodes, [id]: node });
    return { ok: true, workspace: attach(seeded, id, parentId), id };
}
export function createRequest(
    workspace: Workspace,
    parentId: ParentId,
    name: string,
    snapshot: RequestSnapshot = createSnapshot()
): WorkspaceResult {
    const problem = validateParent(workspace, 'request', parentId);
    if (problem) {
        return { ok: false, reason: problem };
    }
    const id = createNodeId();
    const now = Date.now();
    const node: RequestNode = {
        id,
        kind: 'request',
        name: cleanName(name, DEFAULT_REQUEST_NAME),
        snapshot,
        createdAt: now,
        updatedAt: now,
    };
    const seeded = withNodes(workspace, { ...workspace.nodes, [id]: node });
    return { ok: true, workspace: attach(seeded, id, parentId), id };
}
export function renameNode(workspace: Workspace, id: string, name: string): WorkspaceResult {
    const node = workspace.nodes[id];
    if (!node) {
        return { ok: false, reason: 'That item no longer exists.' };
    }
    const trimmed = name.trim();
    if (!trimmed) {
        return { ok: false, reason: 'The name cannot be empty.' };
    }
    return {
        ok: true,
        id,
        workspace: withNodes(workspace, {
            ...workspace.nodes,
            [id]: { ...node, name: trimmed, updatedAt: Date.now() },
        }),
    };
}
export function deleteNode(workspace: Workspace, id: string): DeleteResult {
    if (!workspace.nodes[id]) {
        return { ok: false, reason: 'That item no longer exists.' };
    }
    const removedIds = subtreeIds(workspace, id);
    const detached = detach(workspace, id);
    const nodes = { ...detached.nodes };
    for (const removedId of removedIds) {
        delete nodes[removedId];
    }
    return { ok: true, workspace: { nodes, rootIds: detached.rootIds }, removedIds };
}
export function moveNode(
    workspace: Workspace,
    id: string,
    targetParentId: ParentId,
    index?: number
): WorkspaceResult {
    const node = workspace.nodes[id];
    if (!node) {
        return { ok: false, reason: 'That item no longer exists.' };
    }
    const problem = validateParent(workspace, node.kind, targetParentId);
    if (problem) {
        return { ok: false, reason: problem };
    }
    if (targetParentId !== null) {
        if (subtreeIds(workspace, id).includes(targetParentId)) {
            return { ok: false, reason: 'An item cannot be moved inside itself.' };
        }
    }
    const currentParent = parentOf(workspace, id);
    const siblings = childIdsOf(workspace, targetParentId);
    const currentIndex = siblings.indexOf(id);
    let targetIndex = index;
    if (
        currentParent === targetParentId &&
        currentIndex !== -1 &&
        targetIndex !== undefined &&
        targetIndex > currentIndex
    ) {
        targetIndex -= 1;
    }
    const detached = detach(workspace, id);
    return { ok: true, id, workspace: attach(detached, id, targetParentId, targetIndex) };
}
export function duplicateNode(workspace: Workspace, id: string): WorkspaceResult {
    const original = workspace.nodes[id];
    if (!original) {
        return { ok: false, reason: 'That item no longer exists.' };
    }
    const parentId = parentOf(workspace, id);
    if (parentId === undefined) {
        return { ok: false, reason: 'That item is not attached to the tree.' };
    }
    const nodes = { ...workspace.nodes };
    const now = Date.now();
    const copy = (sourceId: string, depth: number): string => {
        const source = nodes[sourceId];
        const newId = createNodeId();
        if (isGroup(source)) {
            const childIds =
                depth > MAX_DEPTH ? [] : source.childIds.map((childId) => copy(childId, depth + 1));
            nodes[newId] = { ...source, id: newId, childIds, createdAt: now, updatedAt: now };
        } else if (isRequest(source)) {
            nodes[newId] = {
                ...source,
                id: newId,
                snapshot: structuredClone(source.snapshot),
                createdAt: now,
                updatedAt: now,
            };
        }
        return newId;
    };
    const newId = copy(id, 0);
    const clone = nodes[newId];
    if (clone) {
        nodes[newId] = { ...clone, name: `${original.name} copy` };
    }
    const seeded: Workspace = { nodes, rootIds: workspace.rootIds };
    const siblings = childIdsOf(seeded, parentId);
    return {
        ok: true,
        id: newId,
        workspace: attach(seeded, newId, parentId, siblings.indexOf(id) + 1),
    };
}
export function updateRequestSnapshot(
    workspace: Workspace,
    id: string,
    snapshot: RequestSnapshot
): WorkspaceResult {
    const node = getRequest(workspace, id);
    if (!node) {
        return { ok: false, reason: 'That request no longer exists.' };
    }
    return {
        ok: true,
        id,
        workspace: withNodes(workspace, {
            ...workspace.nodes,
            [id]: { ...node, snapshot, updatedAt: Date.now() },
        }),
    };
}
export function requestLabel(node: RequestNode): string {
    if (node.name.trim()) {
        return node.name.trim();
    }
    const url = node.snapshot.url.trim();
    if (!url) {
        return DEFAULT_REQUEST_NAME;
    }
    try {
        const parsed = new URL(url);
        return parsed.pathname === '/' ? parsed.hostname : parsed.pathname;
    } catch {
        return url.length > 28 ? `${url.slice(0, 28)}…` : url;
    }
}
