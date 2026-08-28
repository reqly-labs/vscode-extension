import type { RequestSnapshot } from './types';
import {
    createWorkspace,
    isGroup,
    isRequest,
    type Workspace,
    type WorkspaceNode,
} from './workspace';

export const COLLECTION_FILE_VERSION = 1;

const MAX_DEPTH = 64;

export interface DocumentNode {
    id: string;
    kind: 'collection' | 'folder' | 'request';
    name: string;
    createdAt?: number;
    updatedAt?: number;
    children?: DocumentNode[];
    snapshot?: RequestSnapshot;
}

export interface CollectionDocument {
    reqly: number;
    order: number;
    node: DocumentNode;
}

export interface ParsedDocument {
    nodes: Record<string, WorkspaceNode>;
    rootId: string;
    order: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toDocument(
    workspace: Workspace,
    rootId: string,
    order: number
): CollectionDocument {
    const build = (id: string, depth: number): DocumentNode | null => {
        const node = workspace.nodes[id];

        if (!node || depth > MAX_DEPTH) {
            return null;
        }

        const base = {
            id: node.id,
            kind: node.kind,
            name: node.name,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
        };

        if (isRequest(node)) {
            return { ...base, snapshot: node.snapshot };
        }

        return {
            ...base,
            children: node.childIds
                .map((childId) => build(childId, depth + 1))
                .filter((child): child is DocumentNode => child !== null),
        };
    };

    const node = build(rootId, 0);

    if (!node) {
        throw new Error(`Cannot write a document for the missing node "${rootId}".`);
    }

    return { reqly: COLLECTION_FILE_VERSION, order, node };
}

export function parseDocument(raw: unknown): ParsedDocument | null {
    if (!isRecord(raw) || !isRecord(raw.node)) {
        return null;
    }

    const nodes: Record<string, WorkspaceNode> = {};
    const collect = (value: unknown, depth: number): string | null => {
        if (!isRecord(value) || typeof value.id !== 'string' || !value.id || depth > MAX_DEPTH) {
            return null;
        }

        const name = typeof value.name === 'string' ? value.name : '';
        const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now();
        const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : createdAt;

        if (value.kind === 'request') {
            nodes[value.id] = {
                id: value.id,
                kind: 'request',
                name,
                createdAt,
                updatedAt,
                snapshot: value.snapshot as RequestSnapshot,
            };

            return value.id;
        }

        const kind = value.kind === 'folder' ? 'folder' : 'collection';
        const children = Array.isArray(value.children) ? value.children : [];

        nodes[value.id] = {
            id: value.id,
            kind,
            name,
            createdAt,
            updatedAt,
            childIds: children
                .map((child) => collect(child, depth + 1))
                .filter((id): id is string => id !== null),
        };

        return value.id;
    };

    const rootId = collect(raw.node, 0);

    if (!rootId) {
        return null;
    }

    return { nodes, rootId, order: typeof raw.order === 'number' ? raw.order : 0 };
}

export function mergeDocuments(parsed: readonly ParsedDocument[]): Workspace {
    const ordered = [...parsed].sort((a, b) => a.order - b.order);
    const workspace = createWorkspace();

    for (const document of ordered) {
        for (const [id, node] of Object.entries(document.nodes)) {
            workspace.nodes[id] = node;
        }

        workspace.rootIds.push(document.rootId);
    }

    return workspace;
}

export function rootDocuments(workspace: Workspace): CollectionDocument[] {
    return workspace.rootIds
        .filter((id) => workspace.nodes[id])
        .map((id, index) => toDocument(workspace, id, index));
}

export function documentKind(node: WorkspaceNode): 'collection' | 'request' {
    return isGroup(node) ? 'collection' : 'request';
}
