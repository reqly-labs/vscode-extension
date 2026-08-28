import * as assert from 'node:assert/strict';
import type { WebviewState } from '../core/messages';
import { secretOf } from '../core/secrets';
import { createSettings, createSnapshot, type RequestSnapshot } from '../core/types';
import { getRequest } from '../core/workspace';
import { RequestStateService } from '../services/RequestStateService';
import { SecretStore } from '../services/SecretStore';
import { WorkspaceService } from '../services/WorkspaceService';
import { FakeMemento } from './FakeMemento';
import { FakePersistence } from './FakePersistence';
import { FakeSecretStorage } from './FakeSecretStorage';

const TOKEN = 'super-secret-token-42';

function tokenSnapshot(): RequestSnapshot {
    return {
        ...createSnapshot(),
        url: 'https://api.example.com/apartamentos',
        auth: { type: 'bearer', token: TOKEN, prefix: 'Bearer' },
    };
}

function draftState(): WebviewState {
    return {
        snapshot: tokenSnapshot(),
        settings: createSettings(),
        activeRequestTab: 'auth',
        activeResponseTab: 'body',
        activeRequestId: null,
    };
}

async function seed(): Promise<{
    files: FakePersistence;
    storage: FakeSecretStorage;
    service: WorkspaceService;
    requestId: string;
}> {
    const files = new FakePersistence();
    const storage = new FakeSecretStorage();
    const service = await WorkspaceService.open(files, new SecretStore(storage));
    const collection = await service.createCollection('Catálogo');

    assert.ok(collection.ok);
    const request = await service.createRequest(collection.id as string, 'Listar', tokenSnapshot());

    assert.ok(request.ok);

    return { files, storage, service, requestId: request.id as string };
}

function stored(files: FakePersistence): string {
    return files.contents;
}

suite('workspace secret storage', () => {
    test('never writes the credential into the collection files', async () => {
        const { files } = await seed();

        assert.equal(stored(files).includes(TOKEN), false, 'the token reached the plain store');
    });
    test('keeps the rest of the request readable in the files', async () => {
        const { files } = await seed();

        assert.equal(stored(files).includes('api.example.com/apartamentos'), true);
        assert.equal(stored(files).includes('Bearer'), true);
    });
    test('hands the credential to the secret storage instead', async () => {
        const { storage, requestId } = await seed();

        assert.deepEqual(storage.keys(), ['reqly.secrets']);
        assert.deepEqual(JSON.parse((await storage.get('reqly.secrets')) as string), {
            [requestId]: TOKEN,
        });
    });
    test('still serves the credential to the running session', async () => {
        const { service, requestId } = await seed();

        assert.equal(secretOf(getRequest(service.workspace, requestId)!.snapshot.auth), TOKEN);
    });
    test('restores the credential for the next session', async () => {
        const { files, storage, requestId } = await seed();
        const reopened = await WorkspaceService.open(files, new SecretStore(storage));

        assert.equal(secretOf(getRequest(reopened.workspace, requestId)!.snapshot.auth), TOKEN);
    });
    test('survives being reloaded more than once', async () => {
        const { files, storage, requestId } = await seed();
        const reopened = await WorkspaceService.open(files, new SecretStore(storage));

        await reopened.reload();
        await reopened.reload();
        assert.equal(secretOf(getRequest(reopened.workspace, requestId)!.snapshot.auth), TOKEN);
    });
    test('forgets the credential when the request is deleted', async () => {
        const { storage, service, requestId } = await seed();

        await service.remove(requestId);
        assert.deepEqual(storage.keys(), []);
    });
    test('forgets every credential when the workspace is cleared', async () => {
        const { storage, service } = await seed();

        await service.clear();
        assert.deepEqual(storage.keys(), []);
    });
    test('carries the credential over to a duplicated request', async () => {
        const { storage, service, requestId } = await seed();
        const copy = await service.duplicate(requestId);

        assert.ok(copy.ok);
        const vault = JSON.parse((await storage.get('reqly.secrets')) as string);

        assert.equal(vault[copy.id as string], TOKEN);
        assert.equal(vault[requestId], TOKEN);
    });
    test('sweeps a credential left in a collection file into the vault', async () => {
        const plain = new FakePersistence();
        const exposed = await WorkspaceService.open(plain);
        const collection = await exposed.createCollection('Catálogo');

        assert.ok(collection.ok);

        const request = await exposed.createRequest(
            collection.id as string,
            'Listar',
            tokenSnapshot()
        );

        assert.ok(request.ok);
        assert.equal(stored(plain).includes(TOKEN), true, 'the fixture must start exposed');

        const storage = new FakeSecretStorage();
        const upgraded = await WorkspaceService.open(plain, new SecretStore(storage));

        assert.equal(stored(plain).includes(TOKEN), false, 'the file copy must be erased');
        assert.deepEqual(JSON.parse((await storage.get('reqly.secrets')) as string), {
            [request.id as string]: TOKEN,
        });
        assert.equal(
            secretOf(getRequest(upgraded.workspace, request.id as string)!.snapshot.auth),
            TOKEN
        );
    });
    test('writes the credential in the clear only when there is no vault at all', async () => {
        const plain = new FakePersistence();
        const service = await WorkspaceService.open(plain);
        const collection = await service.createCollection('Catálogo');

        assert.ok(collection.ok);

        const request = await service.createRequest(
            collection.id as string,
            'Listar',
            tokenSnapshot()
        );

        assert.ok(request.ok);
        assert.equal(stored(plain).includes(TOKEN), true);
    });
    test('never leaves the credential in the file when the keychain refuses it', async () => {
        const plain = new FakePersistence();
        const storage = new FakeSecretStorage();

        storage.failing = true;

        const service = await WorkspaceService.open(plain, new SecretStore(storage));
        const collection = await service.createCollection('Catálogo');

        assert.ok(collection.ok);

        let warned = false;

        service.onSecretsUnavailable(() => (warned = true));
        await service.createRequest(collection.id as string, 'Listar', tokenSnapshot());

        assert.equal(
            stored(plain).includes(TOKEN),
            false,
            'a credential must never be written to a file that can be committed'
        );
        assert.equal(warned, true, 'the caller must be told the credential was not saved');
    });
});
suite('draft secret storage', () => {
    test('keeps the editor draft credential out of the memento', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.write(draftState());
        assert.equal(JSON.stringify(memento.get('reqly.requestState')).includes(TOKEN), false);
        assert.deepEqual(storage.keys(), ['reqly.draftSecret']);
    });
    test('gives the draft credential back when the panel reopens', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.write(draftState());
        const reopened = new RequestStateService(memento, new SecretStore(storage));

        assert.equal(secretOf(reopened.read().snapshot.auth), '');
        assert.equal(secretOf((await reopened.readWithSecret()).snapshot.auth), TOKEN);
    });
    test('does not wipe the draft credential when only the link changes', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.write(draftState());
        await store.setActiveRequestId('req-1');
        assert.equal(store.read().activeRequestId, 'req-1');
        assert.equal(secretOf((await store.readWithSecret()).snapshot.auth), TOKEN);
    });
    test('moves a draft credential an older version left exposed', async () => {
        const memento = new FakeMemento();

        await new RequestStateService(memento).write(draftState());
        assert.equal(JSON.stringify(memento.get('reqly.requestState')).includes(TOKEN), true);
        const storage = new FakeSecretStorage();
        const upgraded = new RequestStateService(memento, new SecretStore(storage));

        await upgraded.migrate();
        assert.equal(JSON.stringify(memento.get('reqly.requestState')).includes(TOKEN), false);
        assert.equal(secretOf((await upgraded.readWithSecret()).snapshot.auth), TOKEN);
    });
    test('leaves the vault alone when there is nothing to migrate', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.migrate();
        assert.deepEqual(storage.keys(), []);
    });
    test('keeps the draft credential when the keychain refuses to store it', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();

        storage.failing = true;
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.write(draftState());
        assert.equal(JSON.stringify(memento.get('reqly.requestState')).includes(TOKEN), true);
    });
    test('clears the draft credential when the state is reset', async () => {
        const memento = new FakeMemento();
        const storage = new FakeSecretStorage();
        const store = new RequestStateService(memento, new SecretStore(storage));

        await store.write(draftState());
        await store.reset();
        assert.deepEqual(storage.keys(), []);
    });
});
