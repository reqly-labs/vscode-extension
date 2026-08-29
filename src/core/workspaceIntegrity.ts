import { createSnapshot, type FormField, type KeyValue, type RequestSnapshot } from './types';
import type { Variable } from './variables';
import {
    createWorkspace,
    isGroup,
    type GroupNode,
    type RequestNode,
    type Workspace,
    type WorkspaceNode,
} from './workspace';

const MAX_DEPTH = 64;

export interface NormalizeResult {
    workspace: Workspace;
    repairs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asTimestamp(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeKeyValue(value: unknown, index: number): KeyValue | null {
    if (!isRecord(value)) {
        return null;
    }

    return {
        id: asString(value.id) || `kv-${index}`,
        key: asString(value.key),
        value: asString(value.value),
        enabled: value.enabled !== false,
    };
}

function normalizeFormField(value: unknown, index: number): FormField | null {
    const base = normalizeKeyValue(value, index);

    if (!base || !isRecord(value)) {
        return null;
    }

    const filePath = asString(value.filePath);

    return {
        ...base,
        type: value.type === 'file' ? 'file' : 'text',
        ...(filePath ? { filePath } : {}),
    };
}

function normalizeList<T>(value: unknown, map: (item: unknown, index: number) => T | null): T[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(map).filter((item): item is T => item !== null);
}

function normalizeSnapshot(value: unknown): RequestSnapshot {
    const defaults = createSnapshot();

    if (!isRecord(value)) {
        return defaults;
    }

    const params = normalizeList(value.params, normalizeKeyValue);
    const headers = normalizeList(value.headers, normalizeKeyValue);
    const formBody = normalizeList(value.formBody, normalizeKeyValue);
    const multipartBody = normalizeList(value.multipartBody, normalizeFormField);

    return {
        ...defaults,
        ...value,
        params: params.length > 0 ? params : defaults.params,
        headers: headers.length > 0 ? headers : defaults.headers,
        formBody: formBody.length > 0 ? formBody : defaults.formBody,
        multipartBody: multipartBody.length > 0 ? multipartBody : defaults.multipartBody,
        body: asString(value.body),
        url: asString(value.url),
        binaryPath: asString(value.binaryPath),
    } as RequestSnapshot;
}

function normalizeNode(id: string, value: unknown, now: number): WorkspaceNode | null {
    if (!isRecord(value)) {
        return null;
    }

    const createdAt = asTimestamp(value.createdAt, now);
    const updatedAt = asTimestamp(value.updatedAt, createdAt);
    const name = asString(value.name).trim();

    if (value.kind === 'request') {
        return {
            id,
            kind: 'request',
            name: name || 'Request',
            snapshot: normalizeSnapshot(value.snapshot),
            createdAt,
            updatedAt,
        };
    }

    if (value.kind === 'collection' || value.kind === 'folder') {
        const childIds = Array.isArray(value.childIds)
            ? value.childIds.filter((child): child is string => typeof child === 'string')
            : [];

        return {
            id,
            kind: value.kind,
            name: name || (value.kind === 'collection' ? 'Collection' : 'Folder'),
            childIds,
            createdAt,
            updatedAt,
            ...(Array.isArray(value.variables)
                ? { variables: normalizeVariables(value.variables) }
                : {}),
        };
    }

    return null;
}

function normalizeVariables(raw: unknown[]): Variable[] {
    return raw.filter(isRecord).map((entry, index) => ({
        id: typeof entry.id === 'string' && entry.id ? entry.id : `v${index}`,
        key: typeof entry.key === 'string' ? entry.key : '',
        value: typeof entry.value === 'string' ? entry.value : '',
        enabled: entry.enabled !== false,
        secret: false,
    }));
}

export function normalizeWorkspace(raw: unknown): NormalizeResult {
    const repairs: string[] = [];
    const now = Date.now();

    if (!isRecord(raw)) {
        return { workspace: createWorkspace(), repairs };
    }

    const nodes: Record<string, WorkspaceNode> = {};

    if (isRecord(raw.nodes)) {
        for (const [id, value] of Object.entries(raw.nodes)) {
            const node = normalizeNode(id, value, now);

            if (node) {
                nodes[id] = node;
            } else {
                repairs.push(`Discarded an unreadable entry (${id}).`);
            }
        }
    }

    const rawRootIds = Array.isArray(raw.rootIds)
        ? raw.rootIds.filter((id): id is string => typeof id === 'string')
        : [];
    const claimed = new Set<string>();
    const rootIds: string[] = [];
    const claimChildren = (group: GroupNode, depth: number): string[] => {
        if (depth > MAX_DEPTH) {
            repairs.push(`Flattened "${group.name}" because it was nested too deeply.`);

            return [];
        }

        const kept: string[] = [];

        for (const childId of group.childIds) {
            const child = nodes[childId];

            if (!child) {
                repairs.push(`Removed a missing item from "${group.name}".`);
                continue;
            }

            if (claimed.has(childId)) {
                repairs.push(`Removed a duplicate reference to "${child.name}".`);
                continue;
            }

            claimed.add(childId);
            if (child.kind === 'collection') {
                nodes[childId] = { ...child, kind: 'folder' };
                repairs.push(`Converted the nested collection "${child.name}" into a folder.`);
            }

            kept.push(childId);
            const claimedChild = nodes[childId];

            if (isGroup(claimedChild)) {
                nodes[childId] = {
                    ...claimedChild,
                    childIds: claimChildren(claimedChild, depth + 1),
                };
            }
        }

        return kept;
    };

    for (const id of rawRootIds) {
        const node = nodes[id];

        if (!node) {
            repairs.push('Removed a missing top-level item.');
            continue;
        }

        if (claimed.has(id)) {
            repairs.push(`Removed a duplicate reference to "${node.name}".`);
            continue;
        }

        claimed.add(id);
        if (node.kind === 'folder') {
            nodes[id] = { ...node, kind: 'collection' };
            repairs.push(`Promoted the stray folder "${node.name}" to a collection.`);
        }

        rootIds.push(id);
        const rootNode = nodes[id];

        if (isGroup(rootNode)) {
            nodes[id] = { ...rootNode, childIds: claimChildren(rootNode, 0) };
        }
    }

    for (const node of Object.values(nodes)) {
        if (claimed.has(node.id)) {
            continue;
        }

        claimed.add(node.id);
        if (node.kind === 'folder') {
            nodes[node.id] = { ...node, kind: 'collection' };
        }

        rootIds.push(node.id);
        repairs.push(`Recovered "${node.name}" to the top level.`);
        const recovered = nodes[node.id];

        if (isGroup(recovered)) {
            nodes[node.id] = { ...recovered, childIds: claimChildren(recovered, 0) };
        }
    }

    return { workspace: { nodes, rootIds }, repairs };
}

export function readWorkspace(raw: unknown): Workspace {
    return normalizeWorkspace(raw).workspace;
}

export type { GroupNode, RequestNode };
