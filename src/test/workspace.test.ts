import * as assert from 'node:assert/strict';
import { createSnapshot } from '../core/types';
import {
    ancestorsOf,
    childIdsOf,
    createCollection,
    createFolder,
    createRequest,
    createWorkspace,
    deleteNode,
    duplicateNode,
    getGroup,
    getRequest,
    moveNode,
    parentOf,
    renameNode,
    requestLabel,
    subtreeIds,
    updateRequestSnapshot,
    type Workspace,
} from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
    assert.ok(result.ok, `expected success, got: ${(result as { reason?: string }).reason}`);
    return result as Extract<T, { ok: true }>;
}

function seed(): { workspace: Workspace; collectionId: string; requestId: string } {
    const created = expectOk(createCollection(createWorkspace(), 'API'));
    const withRequest = expectOk(
        createRequest(created.workspace, created.id, 'List users', createSnapshot())
    );

    return {
        workspace: withRequest.workspace,
        collectionId: created.id,
        requestId: withRequest.id,
    };
}

suite('workspace structure', () => {
    test('a new collection lands at the root', () => {
        const { workspace, collectionId } = seed();

        assert.deepEqual(workspace.rootIds, [collectionId]);
        assert.equal(getGroup(workspace, collectionId)?.name, 'API');
    });

    test('a request created in a collection is a child of it, not of the root', () => {
        const { workspace, collectionId, requestId } = seed();

        assert.deepEqual(childIdsOf(workspace, collectionId), [requestId]);
        assert.deepEqual(workspace.rootIds, [collectionId]);
        assert.equal(parentOf(workspace, requestId), collectionId);
    });

    test('a loose request is allowed at the root', () => {
        const result = expectOk(createRequest(createWorkspace(), null, 'Ping'));

        assert.deepEqual(result.workspace.rootIds, [result.id]);
        assert.equal(parentOf(result.workspace, result.id), null);
    });

    test('folders are rejected at the root', () => {
        const result = createFolder(createWorkspace(), 'nope', 'Orphan');

        assert.equal(result.ok, false);
    });

    test('collections are rejected inside another collection', () => {
        const { workspace, collectionId } = seed();
        const second = expectOk(createCollection(workspace, 'Second'));

        const result = moveNode(second.workspace, second.id, collectionId);

        assert.equal(result.ok, false);
        assert.match((result as { reason: string }).reason, /top level/);
    });

    test('ancestors are derived from the tree, deepest last', () => {
        const { workspace, collectionId } = seed();
        const folder = expectOk(createFolder(workspace, collectionId, 'v1'));
        const nested = expectOk(createFolder(folder.workspace, folder.id, 'users'));
        const request = expectOk(createRequest(nested.workspace, nested.id, 'Detail'));

        const chain = ancestorsOf(request.workspace, request.id).map((node) => node.name);

        assert.deepEqual(chain, ['API', 'v1', 'users']);
    });
});

suite('workspace mutations address a node by its own id', () => {
    test('renaming needs only the node id', () => {
        const { workspace, requestId } = seed();
        const renamed = expectOk(renameNode(workspace, requestId, '  Fetch users  '));

        assert.equal(getRequest(renamed.workspace, requestId)?.name, 'Fetch users');
    });

    test('renaming a missing node reports a reason instead of silently passing', () => {
        const { workspace } = seed();
        const result = renameNode(workspace, 'does-not-exist', 'X');

        assert.equal(result.ok, false);
        assert.match((result as { reason: string }).reason, /no longer exists/);
    });

    test('an empty name is rejected rather than wiping the label', () => {
        const { workspace, requestId } = seed();

        assert.equal(renameNode(workspace, requestId, '   ').ok, false);
    });

    test('updating a snapshot targets only that request', () => {
        const { workspace, collectionId, requestId } = seed();
        const sibling = expectOk(createRequest(workspace, collectionId, 'Other'));

        const updated = expectOk(
            updateRequestSnapshot(sibling.workspace, requestId, {
                ...createSnapshot(),
                url: 'https://api.test/users',
            })
        );

        assert.equal(getRequest(updated.workspace, requestId)?.snapshot.url, 'https://api.test/users');
        assert.equal(getRequest(updated.workspace, sibling.id)?.snapshot.url, '');
    });
});

suite('workspace deletion', () => {
    test('deleting a collection removes its whole subtree', () => {
        const { workspace, collectionId, requestId } = seed();
        const folder = expectOk(createFolder(workspace, collectionId, 'v1'));
        const nested = expectOk(createRequest(folder.workspace, folder.id, 'Nested'));

        const result = deleteNode(nested.workspace, collectionId);
        assert.ok(result.ok);

        assert.deepEqual(result.workspace.rootIds, []);
        assert.deepEqual(Object.keys(result.workspace.nodes), []);
        assert.deepEqual(
            [...result.removedIds].sort(),
            [collectionId, requestId, folder.id, nested.id].sort()
        );
    });

    test('deleting one request leaves its siblings attached', () => {
        const { workspace, collectionId, requestId } = seed();
        const sibling = expectOk(createRequest(workspace, collectionId, 'Keep me'));

        const result = deleteNode(sibling.workspace, requestId);
        assert.ok(result.ok);

        assert.deepEqual(childIdsOf(result.workspace, collectionId), [sibling.id]);
    });
});

suite('workspace moves', () => {
    test('a request moves between collections and the old parent lets go', () => {
        const { workspace, collectionId, requestId } = seed();
        const other = expectOk(createCollection(workspace, 'Other'));

        const moved = expectOk(moveNode(other.workspace, requestId, other.id));

        assert.deepEqual(childIdsOf(moved.workspace, collectionId), []);
        assert.deepEqual(childIdsOf(moved.workspace, other.id), [requestId]);
        assert.equal(parentOf(moved.workspace, requestId), other.id);
    });

    test('a request can be moved out to the root', () => {
        const { workspace, collectionId, requestId } = seed();
        const moved = expectOk(moveNode(workspace, requestId, null));

        assert.deepEqual(childIdsOf(moved.workspace, collectionId), []);
        assert.ok(moved.workspace.rootIds.includes(requestId));
    });

    test('a group cannot be dropped inside its own descendant', () => {
        const { workspace, collectionId } = seed();
        const folder = expectOk(createFolder(workspace, collectionId, 'v1'));
        const deeper = expectOk(createFolder(folder.workspace, folder.id, 'users'));

        const result = moveNode(deeper.workspace, folder.id, deeper.id);

        assert.equal(result.ok, false);
        assert.match((result as { reason: string }).reason, /inside itself/);
    });

    test('a group cannot be dropped into itself', () => {
        const { workspace, collectionId } = seed();
        const folder = expectOk(createFolder(workspace, collectionId, 'v1'));

        assert.equal(moveNode(folder.workspace, folder.id, folder.id).ok, false);
    });

    test('reordering downwards lands on the slot the index pointed at', () => {
        const base = expectOk(createCollection(createWorkspace(), 'API'));
        const a = expectOk(createRequest(base.workspace, base.id, 'A'));
        const b = expectOk(createRequest(a.workspace, base.id, 'B'));
        const c = expectOk(createRequest(b.workspace, base.id, 'C'));

        assert.deepEqual(childIdsOf(c.workspace, base.id), [a.id, b.id, c.id]);

        const moved = expectOk(moveNode(c.workspace, a.id, base.id, 2));

        assert.deepEqual(childIdsOf(moved.workspace, base.id), [b.id, a.id, c.id]);
    });

    test('reordering upwards needs no compensation', () => {
        const base = expectOk(createCollection(createWorkspace(), 'API'));
        const a = expectOk(createRequest(base.workspace, base.id, 'A'));
        const b = expectOk(createRequest(a.workspace, base.id, 'B'));
        const c = expectOk(createRequest(b.workspace, base.id, 'C'));

        const moved = expectOk(moveNode(c.workspace, c.id, base.id, 0));

        assert.deepEqual(childIdsOf(moved.workspace, base.id), [c.id, a.id, b.id]);
    });

    test('appending past the end puts the node last', () => {
        const base = expectOk(createCollection(createWorkspace(), 'API'));
        const a = expectOk(createRequest(base.workspace, base.id, 'A'));
        const b = expectOk(createRequest(a.workspace, base.id, 'B'));

        const moved = expectOk(moveNode(b.workspace, a.id, base.id, 2));

        assert.deepEqual(childIdsOf(moved.workspace, base.id), [b.id, a.id]);
    });

    test('moving a missing node reports a reason', () => {
        const { workspace, collectionId } = seed();

        assert.equal(moveNode(workspace, 'ghost', collectionId).ok, false);
    });
});

suite('workspace duplication', () => {
    test('duplicating a collection deep-copies it under fresh ids', () => {
        const { workspace, collectionId, requestId } = seed();
        const result = expectOk(duplicateNode(workspace, collectionId));

        assert.notEqual(result.id, collectionId);
        assert.equal(getGroup(result.workspace, result.id)?.name, 'API copy');

        const copiedChildIds = childIdsOf(result.workspace, result.id);
        assert.equal(copiedChildIds.length, 1);
        assert.notEqual(copiedChildIds[0], requestId);
        assert.equal(getRequest(result.workspace, copiedChildIds[0])?.name, 'List users');
    });

    test('the copy is inserted directly after the original', () => {
        const { workspace, collectionId } = seed();
        const second = expectOk(createCollection(workspace, 'Zebra'));
        const result = expectOk(duplicateNode(second.workspace, collectionId));

        assert.deepEqual(result.workspace.rootIds, [collectionId, result.id, second.id]);
    });

    test('editing a duplicated request does not touch the original', () => {
        const { workspace, requestId } = seed();
        const copy = expectOk(duplicateNode(workspace, requestId));

        const edited = expectOk(
            updateRequestSnapshot(copy.workspace, copy.id, {
                ...createSnapshot(),
                url: 'https://changed',
            })
        );

        assert.equal(getRequest(edited.workspace, requestId)?.snapshot.url, '');
        assert.equal(getRequest(edited.workspace, copy.id)?.snapshot.url, 'https://changed');
    });
});

suite('workspace integrity repair', () => {
    test('an empty or unreadable payload yields an empty workspace', () => {
        assert.deepEqual(normalizeWorkspace(undefined).workspace, { nodes: {}, rootIds: [] });
        assert.deepEqual(normalizeWorkspace('nonsense').workspace, { nodes: {}, rootIds: [] });
    });

    test('a childId pointing at a missing node is dropped', () => {
        const result = normalizeWorkspace({
            nodes: {
                c1: { kind: 'collection', name: 'API', childIds: ['ghost'] },
            },
            rootIds: ['c1'],
        });

        assert.deepEqual(childIdsOf(result.workspace, 'c1'), []);
        assert.ok(result.repairs.some((line) => /missing item/.test(line)));
    });

    test('a node referenced by two parents is kept only once', () => {
        const result = normalizeWorkspace({
            nodes: {
                c1: { kind: 'collection', name: 'A', childIds: ['r1'] },
                c2: { kind: 'collection', name: 'B', childIds: ['r1'] },
                r1: { kind: 'request', name: 'Shared' },
            },
            rootIds: ['c1', 'c2'],
        });

        const inA = childIdsOf(result.workspace, 'c1');
        const inB = childIdsOf(result.workspace, 'c2');

        assert.equal(inA.length + inB.length, 1);
        assert.ok(result.repairs.some((line) => /duplicate reference/.test(line)));
    });

    test('a cycle is broken instead of hanging the walk', () => {
        const result = normalizeWorkspace({
            nodes: {
                c1: { kind: 'collection', name: 'A', childIds: ['f1'] },
                f1: { kind: 'folder', name: 'B', childIds: ['c1'] },
            },
            rootIds: ['c1'],
        });

        assert.deepEqual(result.workspace.rootIds, ['c1']);
        assert.deepEqual(childIdsOf(result.workspace, 'f1'), []);
    });

    test('an unreachable node is recovered to the root rather than lost', () => {
        const result = normalizeWorkspace({
            nodes: {
                c1: { kind: 'collection', name: 'A', childIds: [] },
                r9: { kind: 'request', name: 'Stranded' },
            },
            rootIds: ['c1'],
        });

        assert.ok(result.workspace.rootIds.includes('r9'));
        assert.ok(result.repairs.some((line) => /Recovered/.test(line)));
    });

    test('placement rules are restored by converting, not deleting', () => {
        const result = normalizeWorkspace({
            nodes: {
                f1: { kind: 'folder', name: 'AtRoot', childIds: ['c2'] },
                c2: { kind: 'collection', name: 'Nested', childIds: [] },
            },
            rootIds: ['f1'],
        });

        assert.equal(result.workspace.nodes.f1.kind, 'collection');
        assert.equal(result.workspace.nodes.c2.kind, 'folder');
    });

    test('a request snapshot missing fields is filled from the defaults', () => {
        const result = normalizeWorkspace({
            nodes: { r1: { kind: 'request', name: 'Bare', snapshot: { url: 'https://x.dev' } } },
            rootIds: ['r1'],
        });

        const snapshot = getRequest(result.workspace, 'r1')?.snapshot;

        assert.equal(snapshot?.url, 'https://x.dev');
        assert.equal(snapshot?.method, 'GET');
        assert.ok(Array.isArray(snapshot?.headers) && snapshot.headers.length > 0);
    });

    test('a repaired tree satisfies the invariants the app relies on', () => {
        const { workspace } = normalizeWorkspace({
            nodes: {
                c1: { kind: 'collection', name: 'A', childIds: ['f1', 'ghost', 'f1'] },
                f1: { kind: 'folder', name: 'B', childIds: ['r1'] },
                r1: { kind: 'request', name: 'R' },
                lost: { kind: 'request', name: 'Lost' },
            },
            rootIds: ['c1', 'c1'],
        });

        const seen = new Set<string>();

        for (const id of subtreeIds(workspace, 'c1')) {
            assert.equal(seen.has(id), false, `node ${id} appears twice`);
            seen.add(id);
        }

        for (const id of workspace.rootIds) {
            assert.notEqual(workspace.nodes[id], undefined);
            assert.notEqual(workspace.nodes[id].kind, 'folder');
        }

        assert.ok(workspace.rootIds.includes('lost'));
    });
});

suite('request labels', () => {
    test('an explicit name wins', () => {
        const { workspace, requestId } = seed();

        assert.equal(requestLabel(getRequest(workspace, requestId)!), 'List users');
    });

    test('an unnamed request falls back to the URL path', () => {
        const created = expectOk(
            createRequest(createWorkspace(), null, '', {
                ...createSnapshot(),
                url: 'https://api.test.dev/v1/users',
            })
        );

        const node = getRequest(created.workspace, created.id)!;

        assert.equal(requestLabel({ ...node, name: '' }), '/v1/users');
    });
});
