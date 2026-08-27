import * as assert from 'node:assert/strict';
import {
    collectSecrets,
    redactSnapshot,
    redactWorkspace,
    restoreSnapshot,
    restoreWorkspace,
    secretOf,
    withSecret,
} from '../core/secrets';
import { createSnapshot, type Auth, type RequestSnapshot } from '../core/types';
import { createCollection, createRequest, type Workspace } from '../core/workspace';
import { SecretStore } from '../services/SecretStore';
import { FakeSecretStorage } from './FakeSecretStorage';

function snapshotWith(auth: Auth): RequestSnapshot {
    return { ...createSnapshot(), url: 'https://api.example.com', auth };
}

function workspaceWithToken(token: string): { workspace: Workspace; requestId: string } {
    const collection = createCollection(createWorkspaceSeed(), 'Catálogo');

    assert.ok(collection.ok);
    const request = createRequest(
        collection.workspace,
        collection.id as string,
        'Listar',
        snapshotWith({ type: 'bearer', token, prefix: 'Bearer' })
    );

    assert.ok(request.ok);

    return { workspace: request.workspace, requestId: request.id as string };
}

function createWorkspaceSeed(): Workspace {
    return { nodes: {}, rootIds: [] };
}

suite('auth secrets', () => {
    test('reads the secret out of every auth type', () => {
        assert.equal(secretOf({ type: 'bearer', token: 't', prefix: 'Bearer' }), 't');
        assert.equal(secretOf({ type: 'basic', username: 'ada', password: 'p' }), 'p');
        assert.equal(secretOf({ type: 'api-key', key: 'X-Key', value: 'v', addTo: 'header' }), 'v');
        assert.equal(secretOf({ type: 'none' }), '');
    });
    test('keeps the non-secret half of the credentials', () => {
        const redacted = redactSnapshot(
            snapshotWith({ type: 'basic', username: 'ada', password: 'hunter2' })
        );

        assert.equal(redacted.auth.type, 'basic');
        assert.equal(secretOf(redacted.auth), '');
        assert.equal((redacted.auth as { username: string }).username, 'ada');
        assert.equal(redacted.url, 'https://api.example.com');
    });
    test('leaves an auth type that carries no secret alone', () => {
        const auth: Auth = { type: 'none' };

        assert.equal(withSecret(auth, 'anything'), auth);
    });
    test('does not copy a snapshot when there is no secret to put back', () => {
        const snapshot = snapshotWith({ type: 'none' });

        assert.equal(restoreSnapshot(snapshot, ''), snapshot);
    });
    test('round-trips a snapshot through redaction and restoration', () => {
        const original = snapshotWith({
            type: 'api-key',
            key: 'X-Key',
            value: 'abc123',
            addTo: 'query',
        });
        const restored = restoreSnapshot(redactSnapshot(original), 'abc123');

        assert.deepEqual(restored, original);
    });
});
suite('workspace secrets', () => {
    test('strips request secrets without touching groups', () => {
        const { workspace, requestId } = workspaceWithToken('abc123');
        const redacted = redactWorkspace(workspace);

        assert.equal(JSON.stringify(redacted).includes('abc123'), false);
        assert.equal(Object.keys(redacted.nodes).length, Object.keys(workspace.nodes).length);
        assert.ok(redacted.nodes[requestId]);
    });
    test('does not mutate the workspace it redacts', () => {
        const { workspace } = workspaceWithToken('abc123');

        redactWorkspace(workspace);
        assert.equal(JSON.stringify(workspace).includes('abc123'), true);
    });
    test('collects one entry per request that actually has a secret', () => {
        const { workspace, requestId } = workspaceWithToken('abc123');
        const secrets = collectSecrets(workspace);

        assert.deepEqual(secrets, { [requestId]: 'abc123' });
        assert.deepEqual(collectSecrets(redactWorkspace(workspace)), {});
    });
    test('puts the secrets back where they came from', () => {
        const { workspace } = workspaceWithToken('abc123');
        const restored = restoreWorkspace(redactWorkspace(workspace), collectSecrets(workspace));

        assert.deepEqual(restored, workspace);
    });
    test('ignores a secret whose request is gone', () => {
        const { workspace } = workspaceWithToken('abc123');
        const restored = restoreWorkspace(redactWorkspace(workspace), { 'no-such-id': 'zzz' });

        assert.equal(JSON.stringify(restored).includes('zzz'), false);
    });
});
suite('SecretStore', () => {
    test('starts empty', async () => {
        const store = new SecretStore(new FakeSecretStorage());

        assert.deepEqual(await store.readWorkspace(), {});
        assert.equal(await store.readDraft(), '');
    });
    test('round-trips the workspace secrets', async () => {
        const store = new SecretStore(new FakeSecretStorage());

        await store.writeWorkspace({ a: 'one', b: 'two' });
        assert.deepEqual(await store.readWorkspace(), { a: 'one', b: 'two' });
    });
    test('removes the entry instead of storing an empty map', async () => {
        const storage = new FakeSecretStorage();
        const store = new SecretStore(storage);

        await store.writeWorkspace({ a: 'one' });
        await store.writeWorkspace({});
        assert.deepEqual(storage.keys(), []);
    });
    test('round-trips the draft secret and clears it when empty', async () => {
        const storage = new FakeSecretStorage();
        const store = new SecretStore(storage);

        await store.writeDraft('abc123');
        assert.equal(await store.readDraft(), 'abc123');
        await store.writeDraft('');
        assert.deepEqual(storage.keys(), []);
    });
    test('clear wipes both slots', async () => {
        const storage = new FakeSecretStorage();
        const store = new SecretStore(storage);

        await store.writeWorkspace({ a: 'one' });
        await store.writeDraft('abc123');
        await store.clear();
        assert.deepEqual(storage.keys(), []);
    });
    test('survives a corrupted vault', async () => {
        const storage = new FakeSecretStorage();

        await storage.store('reqly.secrets', '{not json');
        assert.deepEqual(await new SecretStore(storage).readWorkspace(), {});
    });
    test('rejects a vault that is not a map of strings', async () => {
        const storage = new FakeSecretStorage();

        await storage.store('reqly.secrets', '{"a":{"nested":true}}');
        assert.deepEqual(await new SecretStore(storage).readWorkspace(), {});
    });
    test('degrades to no secrets when the keychain is unavailable', async () => {
        const storage = new FakeSecretStorage();
        const store = new SecretStore(storage);

        storage.failing = true;
        await store.writeWorkspace({ a: 'one' });
        assert.deepEqual(await store.readWorkspace(), {});
    });
});
