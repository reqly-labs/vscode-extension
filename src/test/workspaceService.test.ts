import * as assert from 'node:assert/strict';
import { createSnapshot } from '../core/types';
import { childIdsOf, getGroup, getRequest, parentOf } from '../core/workspace';
import { WorkspaceService, type WorkspaceChange } from '../services/WorkspaceService';
import { FakePersistence } from './FakePersistence';

function expectId(result: { ok: boolean; id?: string; reason?: string }): string {
    assert.ok(result.ok, `expected success, got: ${result.reason}`);

    return result.id as string;
}

suite('WorkspaceService persistence', () => {
    test('a tree built in one session is intact in the next', async () => {
        const files = new FakePersistence();
        const first = await WorkspaceService.open(files);
        const collectionId = expectId(await first.createCollection('Billing'));
        const folderId = expectId(await first.createFolder(collectionId, 'v2'));
        const requestId = expectId(
            await first.createRequest(folderId, 'Create invoice', {
                ...createSnapshot(),
                method: 'POST',
                url: 'https://api.test.dev/invoices',
            })
        );
        const looseId = expectId(await first.createRequest(null, 'Health check'));
        const second = await WorkspaceService.open(files);

        assert.deepEqual(second.loadRepairs, []);
        assert.equal(getGroup(second.workspace, collectionId)?.name, 'Billing');
        assert.equal(parentOf(second.workspace, folderId), collectionId);
        assert.equal(parentOf(second.workspace, requestId), folderId);
        assert.equal(parentOf(second.workspace, looseId), null);
        const restored = getRequest(second.workspace, requestId);

        assert.equal(restored?.snapshot.method, 'POST');
        assert.equal(restored?.snapshot.url, 'https://api.test.dev/invoices');
    });
    test('nothing is written until a mutation succeeds', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);
        const rejected = await service.createFolder('not-a-real-id', 'Nope');

        assert.equal(rejected.ok, false);
        assert.deepEqual((await WorkspaceService.open(files)).workspace.rootIds, []);
    });
    test('a rename survives the round trip', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);
        const id = expectId(await service.createCollection('Old name'));

        await service.rename(id, 'New name');
        assert.equal(
            getGroup((await WorkspaceService.open(files)).workspace, id)?.name,
            'New name'
        );
    });
    test('deleting reports every id it removed so listeners can unlink', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);
        const collectionId = expectId(await service.createCollection('API'));
        const requestId = expectId(await service.createRequest(collectionId, 'Child'));
        const changes: WorkspaceChange[] = [];

        service.onDidChange((change) => changes.push(change));
        await service.remove(collectionId);
        assert.equal(changes.length, 1);
        assert.deepEqual([...changes[0].removedIds].sort(), [collectionId, requestId].sort());
        assert.deepEqual((await WorkspaceService.open(files)).workspace.rootIds, []);
    });
    test('a change event fires once per successful mutation and never on failure', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);
        const id = expectId(await service.createCollection('API'));
        let fired = 0;

        service.onDidChange(() => (fired += 1));
        await service.rename(id, 'Renamed');
        assert.equal(fired, 1);
        await service.rename(id, '   ');
        assert.equal(fired, 1, 'a rejected rename must not announce a change');
        await service.rename('ghost', 'Whatever');
        assert.equal(fired, 1, 'a missing node must not announce a change');
    });
    test('unsubscribing stops delivery', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        let fired = 0;
        const subscription = service.onDidChange(() => (fired += 1));

        await service.createCollection('One');
        subscription.dispose();
        await service.createCollection('Two');
        assert.equal(fired, 1);
    });
    test('a corrupted store is repaired rather than lost', async () => {
        const files = new FakePersistence();

        files.seedRaw('broken', {
            reqly: 1,
            order: 0,
            node: {
                id: 'f1',
                kind: 'folder',
                name: 'Loose folder',
                children: [{ id: 'r1', kind: 'request', name: 'Kept' }],
            },
        });
        files.corrupt('unreadable');

        const service = await WorkspaceService.open(files);

        assert.ok(service.loadRepairs.length > 0, 'a folder at the root should be repaired');
        assert.equal(service.workspace.nodes.f1?.kind, 'collection');
        assert.deepEqual(childIdsOf(service.workspace, 'f1'), ['r1']);
    });
    test('moving a request keeps exactly one parent after a reload', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);
        const from = expectId(await service.createCollection('From'));
        const to = expectId(await service.createCollection('To'));
        const requestId = expectId(await service.createRequest(from, 'Movable'));

        await service.move(requestId, to);
        const reloaded = (await WorkspaceService.open(files)).workspace;

        assert.deepEqual(childIdsOf(reloaded, from), []);
        assert.deepEqual(childIdsOf(reloaded, to), [requestId]);
        assert.deepEqual(reloaded.rootIds, [from, to]);
    });
    test('clearing wipes the tree and the stored copy together', async () => {
        const files = new FakePersistence();
        const service = await WorkspaceService.open(files);

        await service.createCollection('Doomed');
        await service.clear();
        assert.deepEqual(service.workspace, { nodes: {}, rootIds: [] });
        assert.deepEqual((await WorkspaceService.open(files)).workspace, {
            nodes: {},
            rootIds: [],
        });
    });
});
suite('WorkspaceService reference integrity', () => {
    test('renaming one request never touches an identically named sibling', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const collectionId = expectId(await service.createCollection('API'));
        const first = expectId(await service.createRequest(collectionId, 'Duplicate name'));
        const second = expectId(await service.createRequest(collectionId, 'Duplicate name'));

        await service.rename(second, 'Renamed');
        assert.equal(getRequest(service.workspace, first)?.name, 'Duplicate name');
        assert.equal(getRequest(service.workspace, second)?.name, 'Renamed');
    });
    test('saving into a moved request still lands on that request', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const from = expectId(await service.createCollection('From'));
        const to = expectId(await service.createCollection('To'));
        const requestId = expectId(await service.createRequest(from, 'Target'));

        await service.move(requestId, to);
        await service.updateSnapshot(requestId, { ...createSnapshot(), url: 'https://saved.dev' });
        assert.equal(getRequest(service.workspace, requestId)?.snapshot.url, 'https://saved.dev');
        assert.equal(parentOf(service.workspace, requestId), to);
    });
    test('every generated id is unique across a large tree', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const collectionId = expectId(await service.createCollection('Bulk'));

        for (let index = 0; index < 200; index += 1) {
            await service.createRequest(collectionId, `Request ${index}`);
        }

        const ids = Object.keys(service.workspace.nodes);

        assert.equal(ids.length, 201);
        assert.equal(new Set(ids).size, ids.length);
    });
});
