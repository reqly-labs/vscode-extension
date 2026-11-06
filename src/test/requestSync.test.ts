import * as assert from 'node:assert/strict';
import { createSnapshot, type RequestSnapshot } from '../core/types';
import { getRequest } from '../core/workspace';
import { RequestSync } from '../services/RequestSync';
import { WorkspaceService } from '../services/WorkspaceService';
import { FakePersistence } from './FakePersistence';

interface Harness {
    files: FakePersistence;
    workspace: WorkspaceService;
    sync: RequestSync;
    requestId: string;
    otherId: string;
    saved: RequestSnapshot[];
    reloaded: RequestSnapshot[];
    lost: string[];
    conflicts: number;
    changes: number;
    setActive(id: string | null): void;
    setAutoSave(enabled: boolean): void;
    answerConflict(load: boolean): void;
}

const BASE: RequestSnapshot = { ...createSnapshot(), url: 'https://api.test.dev/users' };

function snapshot(changes: Partial<RequestSnapshot>): RequestSnapshot {
    return { ...structuredClone(BASE), ...changes };
}

async function harness(): Promise<Harness> {
    const files = new FakePersistence();
    const workspace = await WorkspaceService.open(files);
    const collection = await workspace.createCollection('Users');

    assert.ok(collection.ok);

    const request = await workspace.createRequest(collection.id, 'List users', snapshot({}));
    const other = await workspace.createRequest(collection.id, 'Get user', snapshot({}));

    assert.ok(request.ok && other.ok);

    let activeId: string | null = request.id;
    let autoSave = true;
    let loadOnConflict = false;
    const state: Harness = {
        files,
        workspace,
        sync: undefined as unknown as RequestSync,
        requestId: request.id,
        otherId: other.id,
        saved: [],
        reloaded: [],
        lost: [],
        conflicts: 0,
        changes: 0,
        setActive: (id) => (activeId = id),
        setAutoSave: (enabled) => (autoSave = enabled),
        answerConflict: (load) => (loadOnConflict = load),
    };

    state.sync = new RequestSync(workspace, {
        activeId: () => activeId,
        autoSave: () => autoSave,
        saved: (value) => state.saved.push(value),
        reload: async (value) => {
            state.reloaded.push(value);
        },
        conflict: async () => {
            state.conflicts += 1;

            return loadOnConflict;
        },
        lost: async (_value, reason) => {
            state.lost.push(reason);
        },
    });
    state.sync.track(state.sync.stored());
    workspace.onDidChange(() => {
        state.changes += 1;
    });

    return state;
}

async function changeOnDisk(target: Harness, id: string, changes: Partial<RequestSnapshot>) {
    const elsewhere = await WorkspaceService.open(target.files);
    const node = getRequest(elsewhere.workspace, id);

    assert.ok(node);
    await elsewhere.updateSnapshot(id, { ...node.snapshot, ...changes });
    await target.workspace.reload();
}

suite('saving a request as it is edited', () => {
    test('writes a new method to the collection, so the sidebar can show it', async () => {
        const target = await harness();

        await target.sync.edited(target.requestId, snapshot({ method: 'POST' }));

        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.method,
            'POST'
        );
        assert.equal(target.changes, 1, 'the sidebar redraws when the workspace changes');
        assert.equal(target.saved.at(-1)?.method, 'POST');
    });

    test('keeps the edit across a restart', async () => {
        const target = await harness();

        await target.sync.edited(
            target.requestId,
            snapshot({ method: 'DELETE', url: 'https://x' })
        );

        const reopened = await WorkspaceService.open(target.files);

        assert.equal(getRequest(reopened.workspace, target.requestId)?.snapshot.method, 'DELETE');
        assert.equal(getRequest(reopened.workspace, target.requestId)?.snapshot.url, 'https://x');
    });

    test('does not rewrite the file when nothing in the request changed', async () => {
        const target = await harness();
        const before = target.files.saves;

        await target.sync.edited(target.requestId, snapshot({}));

        assert.equal(target.files.saves, before);
        assert.equal(target.saved.length, 1, 'the panel still hears it is in step');
    });

    test('leaves the collection alone while auto save is off', async () => {
        const target = await harness();

        target.setAutoSave(false);
        await target.sync.edited(target.requestId, snapshot({ method: 'PUT' }));

        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.method,
            'GET'
        );
        assert.equal(target.saved.length, 0);
    });

    test('saves on demand while auto save is off', async () => {
        const target = await harness();

        target.setAutoSave(false);
        assert.equal(
            await target.sync.save(target.requestId, snapshot({ method: 'PATCH' }), 'manual'),
            true
        );
        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.method,
            'PATCH'
        );
    });

    test('writes pending edits once auto save is turned back on', async () => {
        const target = await harness();

        target.setAutoSave(false);
        await target.sync.edited(target.requestId, snapshot({ method: 'PUT' }));
        target.setAutoSave(true);
        await target.sync.autoSaveTurnedOn();

        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.method,
            'PUT'
        );
    });

    test('applies saves in the order they were made', async () => {
        const target = await harness();

        void target.sync.edited(target.requestId, snapshot({ url: 'https://one' }));
        void target.sync.save(target.requestId, snapshot({ url: 'https://two' }), 'manual');
        await target.sync.edited(target.requestId, snapshot({ url: 'https://three' }));

        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.url,
            'https://three'
        );
        assert.deepEqual(
            target.saved.map((value) => value.url),
            ['https://one', 'https://two', 'https://three']
        );
    });

    test('lands a late save on the request it was made for', async () => {
        const target = await harness();
        const pending = target.sync.edited(target.requestId, snapshot({ method: 'POST' }));

        target.setActive(target.otherId);
        await pending;

        assert.equal(
            getRequest(target.workspace.workspace, target.requestId)?.snapshot.method,
            'POST'
        );
        assert.equal(
            getRequest(target.workspace.workspace, target.otherId)?.snapshot.method,
            'GET'
        );
        assert.equal(target.saved.length, 0, 'the panel now shows another request');
    });

    test('drops an automatic save for a request that was deleted', async () => {
        const target = await harness();

        await target.workspace.remove(target.requestId);
        assert.equal(await target.sync.save(target.requestId, snapshot({}), 'auto'), false);
        assert.deepEqual(target.lost, []);
    });

    test('asks where to put a manual save for a request that was deleted', async () => {
        const target = await harness();

        await target.workspace.remove(target.requestId);
        await target.sync.save(target.requestId, snapshot({}), 'manual');
        assert.deepEqual(target.lost, ['That request no longer exists.']);
    });
});

suite('following a request that changes on disk', () => {
    test('loads the new version when the panel has nothing unsaved', async () => {
        const target = await harness();

        await changeOnDisk(target, target.requestId, { method: 'PUT' });
        await target.sync.diskChanged();

        assert.equal(target.reloaded.at(-1)?.method, 'PUT');
        assert.equal(target.conflicts, 0);
    });

    test('does not treat its own save as a change on disk', async () => {
        const target = await harness();

        await target.sync.edited(target.requestId, snapshot({ method: 'POST' }));
        await target.sync.diskChanged();

        assert.deepEqual(target.reloaded, []);
    });

    test('asks before replacing edits that were not saved yet', async () => {
        const target = await harness();

        target.setAutoSave(false);
        await target.sync.edited(target.requestId, snapshot({ url: 'https://local' }));
        await changeOnDisk(target, target.requestId, { url: 'https://remote' });
        await target.sync.diskChanged();

        assert.equal(target.conflicts, 1);
        assert.deepEqual(target.reloaded, [], 'the panel keeps its edits');
    });

    test('loads the version on disk when asked to', async () => {
        const target = await harness();

        target.setAutoSave(false);
        target.answerConflict(true);
        await target.sync.edited(target.requestId, snapshot({ url: 'https://local' }));
        await changeOnDisk(target, target.requestId, { url: 'https://remote' });
        await target.sync.diskChanged();

        assert.equal(target.reloaded.at(-1)?.url, 'https://remote');
    });

    test('ignores changes to requests other than the one in the panel', async () => {
        const target = await harness();

        await changeOnDisk(target, target.otherId, { method: 'DELETE' });
        await target.sync.diskChanged();

        assert.deepEqual(target.reloaded, []);
    });
});
