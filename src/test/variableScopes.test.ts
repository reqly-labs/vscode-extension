import * as assert from 'node:assert/strict';
import {
    DYNAMIC_VARIABLES,
    dynamicVariableNames,
    isDynamicVariable,
    resolveDynamicVariable,
} from '../core/dynamicVariables';
import { createSnapshot, type RequestSnapshot } from '../core/types';
import { interpolate, interpolateSnapshot, unresolvedInSnapshot } from '../core/variables';
import {
    createCollection,
    createRequest,
    createWorkspace,
    rootCollectionOf,
    setGroupVariables,
} from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';
import { mergeDocuments, parseDocument, toDocument } from '../core/collectionFile';

function expectId(result: { ok: boolean; id?: string; reason?: string }): string {
    assert.ok(result.ok, result.reason);

    return result.id as string;
}

suite('dynamic variables', () => {
    test('names every one it offers', () => {
        assert.deepEqual(
            dynamicVariableNames(),
            DYNAMIC_VARIABLES.map((entry) => entry.name)
        );
        assert.ok(dynamicVariableNames().every((name) => name.startsWith('$')));
    });

    test('recognises its own names and nothing else', () => {
        assert.equal(isDynamicVariable('$guid'), true);
        assert.equal(isDynamicVariable('$timestamp'), true);
        assert.equal(isDynamicVariable('guid'), false);
        assert.equal(isDynamicVariable('$nope'), false);
    });

    test('produces a usable UUID', () => {
        const value = resolveDynamicVariable('$guid');

        assert.ok(value);
        assert.match(
            value,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
    });

    test('produces a timestamp in seconds and an ISO string', () => {
        const seconds = Number(resolveDynamicVariable('$timestamp'));

        assert.ok(Number.isInteger(seconds));
        assert.ok(Math.abs(seconds * 1000 - Date.now()) < 60000);
        assert.match(resolveDynamicVariable('$isoTimestamp') ?? '', /^\d{4}-\d{2}-\d{2}T/);
    });

    test('keeps a random number inside its range', () => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const value = Number(resolveDynamicVariable('$randomInt'));

            assert.ok(Number.isInteger(value) && value >= 0 && value <= 1000, `got ${value}`);
        }
    });

    test('does not repeat a UUID', () => {
        const seen = new Set<string>();

        for (let attempt = 0; attempt < 500; attempt += 1) {
            seen.add(resolveDynamicVariable('$guid') as string);
        }

        assert.equal(seen.size, 500);
    });

    test('is resolved only when the caller asks for it', () => {
        assert.equal(interpolate('{{$timestamp}}', {}), '{{$timestamp}}');
        assert.notEqual(interpolate('{{$timestamp}}', {}, { dynamic: true }), '{{$timestamp}}');
    });

    test('lets an environment variable of the same name win', () => {
        assert.equal(
            interpolate('{{$timestamp}}', { $timestamp: 'pinned' }, { dynamic: false }),
            'pinned'
        );
    });

    test('reaches a request when it is sent', () => {
        const snapshot: RequestSnapshot = {
            ...createSnapshot(),
            url: 'https://api.test/items/{{$guid}}',
        };
        const sent = interpolateSnapshot(snapshot, {});

        assert.doesNotMatch(sent.url, /\{\{/);
        assert.match(sent.url, /items\/[0-9a-f-]{36}$/);
    });

    test('is never reported as missing', () => {
        const snapshot: RequestSnapshot = {
            ...createSnapshot(),
            url: 'https://api.test/{{$guid}}/{{nope}}',
        };

        assert.deepEqual(unresolvedInSnapshot(snapshot, {}), ['nope']);
    });
});

suite('collection variables', () => {
    function seeded() {
        const collection = createCollection(createWorkspace(), 'Catalogue');

        assert.ok(collection.ok);

        const collectionId = expectId(collection);
        const request = createRequest(collection.workspace, collectionId, 'List', createSnapshot());

        assert.ok(request.ok);

        return { workspace: request.workspace, collectionId, requestId: expectId(request) };
    }

    test('are stored on the collection node', () => {
        const { workspace, collectionId } = seeded();
        const result = setGroupVariables(workspace, collectionId, [
            { id: 'v1', key: 'basePath', value: '/v1', enabled: true, secret: false },
        ]);

        assert.ok(result.ok);

        const node = result.workspace.nodes[collectionId];

        assert.ok(node.kind === 'collection');
        assert.equal(node.variables?.[0].key, 'basePath');
    });

    test('refuse to attach to something that is not a collection', () => {
        const { workspace, requestId } = seeded();

        assert.equal(setGroupVariables(workspace, requestId, []).ok, false);
        assert.equal(setGroupVariables(workspace, 'missing', []).ok, false);
    });

    test('are found from any request inside the collection', () => {
        const { workspace, collectionId, requestId } = seeded();
        const withVars = setGroupVariables(workspace, collectionId, [
            { id: 'v1', key: 'basePath', value: '/v1', enabled: true, secret: false },
        ]);

        assert.ok(withVars.ok);

        const found = rootCollectionOf(withVars.workspace, requestId);

        assert.equal(found?.id, collectionId);
        assert.equal(found?.variables?.[0].value, '/v1');
    });

    test('survive a round trip through the collection file', () => {
        const { workspace, collectionId } = seeded();
        const withVars = setGroupVariables(workspace, collectionId, [
            { id: 'v1', key: 'basePath', value: '/v1', enabled: true, secret: false },
        ]);

        assert.ok(withVars.ok);

        const document = JSON.parse(
            JSON.stringify(toDocument(withVars.workspace, collectionId, 0))
        );
        const parsed = parseDocument(document);

        assert.ok(parsed);

        const rebuilt = normalizeWorkspace(mergeDocuments([parsed])).workspace;
        const node = rebuilt.nodes[collectionId];

        assert.ok(node.kind === 'collection');
        assert.deepEqual(node.variables, [
            { id: 'v1', key: 'basePath', value: '/v1', enabled: true, secret: false },
        ]);
    });

    test('are repaired rather than dropped when a file is hand-edited', () => {
        const { workspace } = normalizeWorkspace({
            nodes: {
                c1: {
                    kind: 'collection',
                    name: 'API',
                    childIds: [],
                    variables: [{ key: 'a', value: 'b' }, 'nonsense', { key: 'c' }],
                },
            },
            rootIds: ['c1'],
        });
        const node = workspace.nodes.c1;

        assert.ok(node.kind === 'collection');
        assert.deepEqual(node.variables, [
            { id: 'v0', key: 'a', value: 'b', enabled: true, secret: false },
            { id: 'v1', key: 'c', value: '', enabled: true, secret: false },
        ]);
    });

    test('never carry a secret flag out of a file', () => {
        const { workspace } = normalizeWorkspace({
            nodes: {
                c1: {
                    kind: 'collection',
                    name: 'API',
                    childIds: [],
                    variables: [{ key: 'token', value: 'leaked', secret: true }],
                },
            },
            rootIds: ['c1'],
        });
        const node = workspace.nodes.c1;

        assert.ok(node.kind === 'collection');
        assert.equal(node.variables?.[0].secret, false);
    });

    test('are overridden by the environment when both define a name', () => {
        const collectionValues = { basePath: '/collection', host: 'https://api.test' };
        const environmentValues = { basePath: '/environment' };
        const merged = { ...collectionValues, ...environmentValues };

        assert.equal(interpolate('{{host}}{{basePath}}', merged), 'https://api.test/environment');
    });
});
