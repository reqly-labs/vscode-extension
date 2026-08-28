import * as assert from 'node:assert/strict';
import {
    COLLECTION_FILE_VERSION,
    mergeDocuments,
    parseDocument,
    rootDocuments,
    toDocument,
} from '../core/collectionFile';
import { createSnapshot } from '../core/types';
import { createCollection, createFolder, createRequest, createWorkspace } from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';

function expectId(result: { ok: boolean; id?: string; reason?: string }): string {
    assert.ok(result.ok, result.reason);

    return result.id as string;
}

function sample() {
    let workspace = createWorkspace();
    const collection = createCollection(workspace, 'Catálogo de Peças');

    workspace = collection.ok ? collection.workspace : workspace;

    const collectionId = expectId(collection);
    const folder = createFolder(workspace, collectionId, 'Apartamentos');

    workspace = folder.ok ? folder.workspace : workspace;

    const folderId = expectId(folder);
    const request = createRequest(workspace, folderId, 'Listar', {
        ...createSnapshot(),
        url: 'http://localhost:5208/apartamentos',
    });

    workspace = request.ok ? request.workspace : workspace;

    return { workspace, collectionId, folderId, requestId: expectId(request) };
}

suite('collection documents', () => {
    test('writes a nested tree instead of a flat map', () => {
        const { workspace, collectionId, folderId, requestId } = sample();
        const document = toDocument(workspace, collectionId, 0);

        assert.equal(document.reqly, COLLECTION_FILE_VERSION);
        assert.equal(document.node.id, collectionId);
        assert.equal(document.node.children?.[0].id, folderId);
        assert.equal(document.node.children?.[0].children?.[0].id, requestId);
        assert.equal(
            document.node.children?.[0].children?.[0].snapshot?.url,
            'http://localhost:5208/apartamentos'
        );
    });

    test('round-trips a tree through a document without losing anything', () => {
        const { workspace, collectionId } = sample();
        const parsed = parseDocument(
            JSON.parse(JSON.stringify(toDocument(workspace, collectionId, 0)))
        );

        assert.ok(parsed);

        const rebuilt = normalizeWorkspace(mergeDocuments([parsed])).workspace;

        assert.deepEqual(rebuilt.rootIds, workspace.rootIds);
        assert.deepEqual(rebuilt.nodes, workspace.nodes);
    });

    test('keeps root order across separate documents', () => {
        const documents = [
            { reqly: 1, order: 2, node: { id: 'c', kind: 'collection' as const, name: 'C' } },
            { reqly: 1, order: 0, node: { id: 'a', kind: 'collection' as const, name: 'A' } },
            { reqly: 1, order: 1, node: { id: 'b', kind: 'collection' as const, name: 'B' } },
        ].map((document) => parseDocument(document));

        assert.ok(documents.every((document) => document !== null));
        assert.deepEqual(mergeDocuments(documents).rootIds, ['a', 'b', 'c']);
    });

    test('produces one document per root node', () => {
        const { workspace } = sample();
        const loose = createRequest(workspace, null, 'Loose', createSnapshot());

        assert.ok(loose.ok);
        assert.equal(rootDocuments(loose.workspace).length, 2);
    });

    test('refuses a payload that is not a document', () => {
        for (const raw of [null, 42, 'text', {}, { node: 'nope' }, { node: {} }, []]) {
            assert.equal(parseDocument(raw), null, `accepted ${JSON.stringify(raw)}`);
        }
    });

    test('drops a malformed child instead of failing the whole file', () => {
        const parsed = parseDocument({
            reqly: 1,
            order: 0,
            node: {
                id: 'c1',
                kind: 'collection',
                name: 'API',
                children: [
                    null,
                    { kind: 'request', name: 'no id' },
                    { id: 'r1', kind: 'request', name: 'Kept' },
                ],
            },
        });

        assert.ok(parsed);
        assert.deepEqual(Object.keys(parsed.nodes).sort(), ['c1', 'r1']);
    });

    test('fills timestamps a hand-edited file left out', () => {
        const parsed = parseDocument({
            node: { id: 'c1', kind: 'collection', name: 'API' },
        });

        assert.ok(parsed);
        assert.equal(typeof parsed.nodes.c1.createdAt, 'number');
        assert.equal(typeof parsed.nodes.c1.updatedAt, 'number');
    });

    test('refuses to write a document for a node that is gone', () => {
        assert.throws(() => toDocument(createWorkspace(), 'missing', 0));
    });
});
