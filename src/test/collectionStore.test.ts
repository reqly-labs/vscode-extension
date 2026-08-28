import * as assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { createSnapshot } from '../core/types';
import { createCollection, createRequest, createWorkspace, renameNode } from '../core/workspace';
import type { Workspace } from '../core/workspace';
import { CollectionStore, fileNameFor, slugify } from '../services/CollectionStore';
import { LEGACY_WORKSPACE_KEY, migrateLegacyWorkspace } from '../services/legacyMigration';
import { FakeMemento } from './FakeMemento';

function expectId(result: { ok: boolean; id?: string; reason?: string }): string {
    assert.ok(result.ok, result.reason);

    return result.id as string;
}

function seeded(): { workspace: Workspace; collectionId: string; requestId: string } {
    const collection = createCollection(createWorkspace(), 'Catalogo de Pecas');

    assert.ok(collection.ok);

    const collectionId = expectId(collection);
    const request = createRequest(collection.workspace, collectionId, 'Listar', {
        ...createSnapshot(),
        url: 'http://localhost:5208/apartamentos',
    });

    assert.ok(request.ok);

    return { workspace: request.workspace, collectionId, requestId: expectId(request) };
}

suite('collection file names', () => {
    test('turns a name into a readable slug', () => {
        assert.equal(slugify('Catalogo de Pecas'), 'catalogo-de-pecas');
        assert.equal(slugify('  Spaces   and---dashes '), 'spaces-and-dashes');
        assert.equal(slugify('***'), 'untitled');
        assert.equal(slugify(''), 'untitled');
    });

    test('keeps the name readable and the id unique', () => {
        assert.equal(
            fileNameFor('collection', 'Catalogo', 'abcdef1234567890'),
            'collection_catalogo_abcdef12.json'
        );
    });

    test('gives two collections sharing a name different files', () => {
        assert.notEqual(
            fileNameFor('collection', 'API', 'aaaa1111'),
            fileNameFor('collection', 'API', 'bbbb2222')
        );
    });
});

suite('collection store on disk', () => {
    let dir = '';
    let store: CollectionStore;

    setup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'reqly-store-'));
        store = new CollectionStore(vscode.Uri.file(dir));
    });

    teardown(async () => {
        store.dispose();
        await rm(dir, { recursive: true, force: true });
    });

    test('writes one readable file per root node', async () => {
        const { workspace } = seeded();

        await store.save(workspace);

        const files = await readdir(dir);

        assert.equal(files.length, 1);
        assert.match(files[0], /^collection_catalogo-de-pecas_/);

        const text = await readFile(join(dir, files[0]), 'utf8');

        assert.match(text, /"name": "Listar"/);
        assert.match(text, /localhost:5208/);
    });

    test('reads back exactly what it wrote', async () => {
        const { workspace, requestId } = seeded();

        await store.save(workspace);

        const loaded = await store.load();

        assert.deepEqual(loaded.repairs, []);
        assert.deepEqual(loaded.unreadable, []);
        assert.deepEqual(loaded.workspace.rootIds, workspace.rootIds);
        assert.equal(loaded.workspace.nodes[requestId].name, 'Listar');
    });

    test('starts empty when the folder does not exist yet', async () => {
        const missing = new CollectionStore(vscode.Uri.file(join(dir, 'nope')));
        const loaded = await missing.load();

        assert.deepEqual(loaded.workspace.rootIds, []);
        missing.dispose();
    });

    test('renames the file when the collection is renamed', async () => {
        const { workspace, collectionId } = seeded();

        await store.save(workspace);

        const renamed = renameNode(workspace, collectionId, 'Estoque');

        assert.ok(renamed.ok);
        await store.save(renamed.workspace);

        const files = await readdir(dir);

        assert.equal(files.length, 1, 'the old file must not be left behind');
        assert.match(files[0], /^collection_estoque_/);
    });

    test('deletes the file when the collection is deleted', async () => {
        const { workspace } = seeded();

        await store.save(workspace);
        await store.save(createWorkspace());

        assert.deepEqual(await readdir(dir), []);
    });

    test('skips a file it cannot parse and says which one', async () => {
        const { workspace } = seeded();

        await store.save(workspace);
        await writeFile(join(dir, 'collection_broken_zzzzzzzz.json'), '{ not json', 'utf8');

        const loaded = await store.load();

        assert.deepEqual(loaded.unreadable, ['collection_broken_zzzzzzzz.json']);
        assert.equal(loaded.workspace.rootIds.length, 1, 'the healthy collection must survive');
    });

    test('ignores files that are not collection documents', async () => {
        await writeFile(join(dir, 'README.md'), 'notes', 'utf8');

        const loaded = await store.load();

        assert.deepEqual(loaded.unreadable, []);
        assert.deepEqual(loaded.workspace.rootIds, []);
    });

    test('does not rewrite a file whose content did not change', async () => {
        const { workspace } = seeded();

        await store.save(workspace);

        const before = await readdir(dir);

        await store.save(workspace);
        assert.deepEqual(await readdir(dir), before);
    });
});

suite('migration from the 1.2.0 state blob', () => {
    let dir = '';
    let store: CollectionStore;

    setup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'reqly-migrate-'));
        store = new CollectionStore(vscode.Uri.file(dir));
    });

    teardown(async () => {
        store.dispose();
        await rm(dir, { recursive: true, force: true });
    });

    test('moves the old blob into files and clears the key', async () => {
        const memento = new FakeMemento();
        const { workspace, requestId } = seeded();

        await memento.update(LEGACY_WORKSPACE_KEY, workspace);

        const result = await migrateLegacyWorkspace(memento, createWorkspace(), (next) =>
            store.save(next)
        );

        assert.equal(result.moved, true);
        assert.equal(result.collections, 1);
        assert.equal(result.requests, 1);
        assert.equal(memento.get(LEGACY_WORKSPACE_KEY), undefined, 'the old key must be cleared');

        const loaded = await store.load();

        assert.equal(loaded.workspace.nodes[requestId].name, 'Listar');
    });

    test('does nothing when there is no old blob', async () => {
        const memento = new FakeMemento();
        const result = await migrateLegacyWorkspace(memento, createWorkspace(), () => {
            throw new Error('must not write');
        });

        assert.equal(result.moved, false);
    });

    test('refuses to overwrite collections that already exist as files', async () => {
        const memento = new FakeMemento();

        await memento.update(LEGACY_WORKSPACE_KEY, seeded().workspace);

        const result = await migrateLegacyWorkspace(memento, seeded().workspace, () => {
            throw new Error('must not write');
        });

        assert.equal(result.moved, false);
        assert.equal(memento.get(LEGACY_WORKSPACE_KEY), undefined, 'the old key is still cleared');
    });

    test('repairs a damaged old blob instead of dropping it', async () => {
        const memento = new FakeMemento();

        await memento.update(LEGACY_WORKSPACE_KEY, {
            nodes: {
                c1: { kind: 'collection', name: 'API', childIds: ['r1', 'gone'] },
                r1: { kind: 'request', name: 'Kept' },
            },
            rootIds: ['c1'],
        });

        const result = await migrateLegacyWorkspace(memento, createWorkspace(), (next) =>
            store.save(next)
        );

        assert.equal(result.moved, true);

        const loaded = await store.load();

        assert.equal(loaded.workspace.nodes.r1?.name, 'Kept');
    });
});
