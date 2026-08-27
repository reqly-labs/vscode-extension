import * as assert from 'node:assert/strict';
import type { WebviewState } from '../core/messages';
import type { RequestSnapshot } from '../core/types';
import { hydrate, isDirty, persistable, setActive, state } from '../webview/store';
import { webviewState } from './webviewHarness';
function loadRequest(snapshot: Partial<RequestSnapshot>, id: string | null = null): void {
    hydrate(webviewState(snapshot, id));
}
suite('webview store', () => {
    setup(() => {
        loadRequest({});
        setActive({ id: null, name: '', location: '' });
    });
    test('keeps the snapshot object identity across hydrations', () => {
        const first = state.snapshot;
        loadRequest({ url: 'https://api.example.com/one' }, 'req-1');
        loadRequest({ url: 'https://api.example.com/two' }, 'req-2');
        assert.equal(state.snapshot, first, 'hydrate must not swap the snapshot object');
        assert.equal(first.url, 'https://api.example.com/two');
    });
    test('keeps collection identities and replaces their contents', () => {
        const { params, headers, formBody, multipartBody } = state.snapshot;
        loadRequest({
            params: [{ id: 'p1', key: 'q', value: 'ducks', enabled: true }],
            headers: [],
            formBody: [{ id: 'f1', key: 'name', value: 'Ada', enabled: true }],
            multipartBody: [{ id: 'm1', key: 'file', value: '', enabled: true, type: 'file' }],
        });
        assert.equal(state.snapshot.params, params);
        assert.equal(state.snapshot.headers, headers);
        assert.equal(state.snapshot.formBody, formBody);
        assert.equal(state.snapshot.multipartBody, multipartBody);
        assert.deepEqual(
            params.map((item) => item.key),
            ['q']
        );
        assert.equal(headers.length, 0);
        assert.equal(multipartBody[0].type, 'file');
    });
    test('fills defaults for a payload that omits fields', () => {
        loadRequest({ url: 'https://api.example.com', method: 'POST' });
        const partial = {
            ...webviewState({}),
            snapshot: { url: 'https://api.example.com/next' } as RequestSnapshot,
        } satisfies WebviewState;
        hydrate(partial);
        assert.equal(state.snapshot.method, 'GET');
        assert.equal(state.snapshot.bodyType, 'none');
        assert.equal(state.snapshot.params.length, 1);
        assert.equal(state.snapshot.url, 'https://api.example.com/next');
    });
    test('keeps activeRequestId in sync with the active request', () => {
        loadRequest({ url: 'https://api.example.com' }, 'req-1');
        assert.equal(state.activeRequestId, 'req-1');
        setActive({ id: 'req-9', name: 'Listar', location: 'Catálogo' });
        assert.equal(state.activeRequestId, 'req-9');
        assert.equal(persistable().activeRequestId, 'req-9');
        setActive(undefined);
        assert.equal(state.activeRequestId, null);
    });
    test('persists the values edited after the last hydration', () => {
        loadRequest({}, 'req-1');
        state.snapshot.url = 'http://localhost:5208/apartamentos';
        assert.equal(persistable().snapshot.url, 'http://localhost:5208/apartamentos');
        assert.equal(persistable().activeRequestId, 'req-1');
    });
    test('resets the dirty baseline on hydrate', () => {
        loadRequest({ url: 'https://api.example.com' }, 'req-1');
        assert.equal(isDirty(), false);
        state.snapshot.url = 'https://api.example.com/edited';
        assert.equal(isDirty(), true);
        loadRequest({ url: 'https://api.example.com/other' }, 'req-2');
        assert.equal(isDirty(), false);
    });
});
