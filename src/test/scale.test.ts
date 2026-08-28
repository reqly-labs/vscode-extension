import * as assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { createSnapshot } from '../core/types';
import { CollectionStore } from '../services/CollectionStore';
import { SecretStore } from '../services/SecretStore';
import { WorkspaceService } from '../services/WorkspaceService';
import { FakeSecretStorage } from './FakeSecretStorage';

const COLLECTIONS = 3;
const REQUESTS_PER_COLLECTION = 200;
const TOTAL = COLLECTIONS * REQUESTS_PER_COLLECTION;

function expectId(result: { ok: boolean; id?: string; reason?: string }): string {
    assert.ok(result.ok, result.reason);

    return result.id as string;
}

async function build(service: WorkspaceService): Promise<string[]> {
    const requestIds: string[] = [];

    for (let c = 0; c < COLLECTIONS; c += 1) {
        const collectionId = expectId(await service.createCollection(`Collection ${c}`));

        for (let r = 0; r < REQUESTS_PER_COLLECTION; r += 1) {
            requestIds.push(
                expectId(
                    await service.createRequest(collectionId, `Request ${r}`, {
                        ...createSnapshot(),
                        url: `https://api.example.com/collection-${c}/resource-${r}`,
                        auth: { type: 'bearer', token: `token-${c}-${r}`, prefix: 'Bearer' },
                    })
                )
            );
        }
    }

    return requestIds;
}

suite(`scale: ${COLLECTIONS} collections of ${REQUESTS_PER_COLLECTION} requests`, function () {
    this.timeout(120000);

    let dir = '';
    let store: CollectionStore;
    let service: WorkspaceService;
    let requestIds: string[] = [];

    suiteSetup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'reqly-scale-'));
        store = new CollectionStore(vscode.Uri.file(dir));
        service = await WorkspaceService.open(store, new SecretStore(new FakeSecretStorage()));
        requestIds = await build(service);
    });

    suiteTeardown(async () => {
        store.dispose();
        service.dispose();
        await rm(dir, { recursive: true, force: true });
    });

    test('holds every request that was created', () => {
        assert.equal(requestIds.length, TOTAL);
        assert.equal(service.workspace.rootIds.length, COLLECTIONS);
    });

    test('keeps one file per collection rather than one per request', async () => {
        const files = await readdir(dir);

        const sizes = await Promise.all(
            files.map(async (name) => (await stat(join(dir, name))).size)
        );

        assert.equal(files.length, COLLECTIONS);
        assert.ok(
            Math.max(...sizes) < 2 * 1024 * 1024,
            'a single collection file grew past two megabytes'
        );
    });

    test('reads the whole library back in well under a second', async () => {
        const started = Date.now();
        const reopened = await WorkspaceService.open(
            store,
            new SecretStore(new FakeSecretStorage())
        );
        const elapsed = Date.now() - started;

        assert.equal(Object.keys(reopened.workspace.nodes).length, TOTAL + COLLECTIONS);
        assert.ok(elapsed < 1000, `loading ${TOTAL} requests took ${elapsed} ms`);
        reopened.dispose();
    });

    test('saves a single edit without rewriting the other collections', async () => {
        const files = await readdir(dir);
        const before = await Promise.all(
            files.map(async (name) => [name, (await stat(join(dir, name))).mtimeMs] as const)
        );

        await new Promise((resolve) => setTimeout(resolve, 20));

        const target = requestIds[0];
        const node = service.workspace.nodes[target];

        assert.ok(node && node.kind === 'request');
        await service.updateSnapshot(target, { ...node.snapshot, url: 'https://changed.test/' });

        const after = await Promise.all(
            files.map(async (name) => [name, (await stat(join(dir, name))).mtimeMs] as const)
        );
        const rewritten = after.filter(
            ([name, time]) => time !== before.find(([other]) => other === name)?.[1]
        );

        assert.equal(rewritten.length, 1, 'editing one request touched more than one file');
    });

    test('keeps a single edit fast', async () => {
        const target = requestIds[TOTAL - 1];
        const node = service.workspace.nodes[target];

        assert.ok(node && node.kind === 'request');

        const started = Date.now();

        await service.updateSnapshot(target, { ...node.snapshot, url: 'https://timed.test/' });

        const elapsed = Date.now() - started;

        assert.ok(elapsed < 500, `saving one request took ${elapsed} ms`);
    });

    test('keeps every credential out of the files', async () => {
        const files = await readdir(dir);
        const contents = await Promise.all(
            files.map((name) => vscode.workspace.fs.readFile(vscode.Uri.file(join(dir, name))))
        );
        const text = contents.map((bytes) => new TextDecoder().decode(bytes)).join('');

        assert.equal(text.includes('token-0-0'), false);
        assert.equal(text.includes('token-2-199'), false);
    });

    test('still serves every credential to the running session', () => {
        const first = service.workspace.nodes[requestIds[0]];

        assert.ok(first && first.kind === 'request' && first.snapshot.auth.type === 'bearer');
        assert.equal(first.snapshot.auth.token, 'token-0-0');
    });
});
