import type { Auth, RequestSnapshot } from './types';
import { isRequest, type Workspace, type WorkspaceNode } from './workspace';
export function secretOf(auth: Auth): string {
    switch (auth.type) {
        case 'bearer':
            return auth.token;
        case 'basic':
            return auth.password;
        case 'api-key':
            return auth.value;
        default:
            return '';
    }
}
export function withSecret(auth: Auth, secret: string): Auth {
    switch (auth.type) {
        case 'bearer':
            return { ...auth, token: secret };
        case 'basic':
            return { ...auth, password: secret };
        case 'api-key':
            return { ...auth, value: secret };
        default:
            return auth;
    }
}
export function redactSnapshot(snapshot: RequestSnapshot): RequestSnapshot {
    return { ...snapshot, auth: withSecret(snapshot.auth, '') };
}
export function restoreSnapshot(snapshot: RequestSnapshot, secret: string): RequestSnapshot {
    if (!secret) {
        return snapshot;
    }
    return { ...snapshot, auth: withSecret(snapshot.auth, secret) };
}
function mapRequests(
    workspace: Workspace,
    transform: (node: WorkspaceNode & { kind: 'request' }, id: string) => WorkspaceNode
): Workspace {
    const nodes: Record<string, WorkspaceNode> = {};
    for (const [id, node] of Object.entries(workspace.nodes)) {
        nodes[id] = isRequest(node) ? transform(node, id) : node;
    }
    return { nodes, rootIds: [...workspace.rootIds] };
}
export function redactWorkspace(workspace: Workspace): Workspace {
    return mapRequests(workspace, (node) => ({
        ...node,
        snapshot: redactSnapshot(node.snapshot),
    }));
}
export function restoreWorkspace(workspace: Workspace, secrets: Record<string, string>): Workspace {
    return mapRequests(workspace, (node, id) => ({
        ...node,
        snapshot: restoreSnapshot(node.snapshot, secrets[id] ?? ''),
    }));
}
export function collectSecrets(workspace: Workspace): Record<string, string> {
    const secrets: Record<string, string> = {};
    for (const [id, node] of Object.entries(workspace.nodes)) {
        if (!isRequest(node)) {
            continue;
        }
        const secret = secretOf(node.snapshot.auth);
        if (secret) {
            secrets[id] = secret;
        }
    }
    return secrets;
}
