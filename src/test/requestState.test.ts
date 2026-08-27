import * as assert from 'node:assert/strict';
import type { WebviewState } from '../core/messages';
import { createSettings, createSnapshot } from '../core/types';
import { RequestStateService } from '../services/RequestStateService';
import { FakeMemento } from './FakeMemento';
function stateFor(url: string, activeRequestId: string | null): WebviewState {
    return {
        snapshot: { ...createSnapshot(), url },
        settings: createSettings(),
        activeRequestTab: 'params',
        activeResponseTab: 'body',
        activeRequestId,
    };
}
function service(): RequestStateService {
    return new RequestStateService(new FakeMemento());
}
suite('RequestStateService', () => {
    test('reads defaults when nothing was stored yet', () => {
        const store = service();
        const state = store.read();
        assert.equal(state.snapshot.url, '');
        assert.equal(state.activeRequestTab, 'params');
        assert.equal(state.activeRequestId, null);
    });
    test('round-trips a written state', async () => {
        const store = service();
        await store.write(stateFor('https://api.example.com', 'req-1'));
        const state = store.read();
        assert.equal(state.snapshot.url, 'https://api.example.com');
        assert.equal(state.activeRequestId, 'req-1');
    });
    test('accepts a webview payload for the request that is open', async () => {
        const store = service();
        const accepted = await store.writeFromWebview(
            stateFor('https://one.test', 'req-1'),
            'req-1'
        );
        assert.equal(accepted, true);
        assert.equal(store.read().snapshot.url, 'https://one.test');
    });
    test('drops a payload left over from the previously open request', async () => {
        const store = service();
        await store.write(stateFor('https://two.test', 'req-2'));
        const accepted = await store.writeFromWebview(
            stateFor('https://one.test', 'req-1'),
            'req-2'
        );
        assert.equal(accepted, false, 'a stale payload must not overwrite the open request');
        assert.equal(store.read().snapshot.url, 'https://two.test');
        assert.equal(store.read().activeRequestId, 'req-2');
    });
    test('accepts a payload for an unsaved request', async () => {
        const store = service();
        const accepted = await store.writeFromWebview(stateFor('https://draft.test', null), null);
        assert.equal(accepted, true);
        assert.equal(store.read().snapshot.url, 'https://draft.test');
    });
    test('drops a payload from an unsaved request once one is open', async () => {
        const store = service();
        await store.write(stateFor('https://open.test', 'req-1'));
        const accepted = await store.writeFromWebview(
            stateFor('https://draft.test', null),
            'req-1'
        );
        assert.equal(accepted, false);
        assert.equal(store.read().snapshot.url, 'https://open.test');
    });
    test('resets back to the defaults', async () => {
        const store = service();
        await store.write(stateFor('https://api.example.com', 'req-1'));
        await store.reset();
        assert.equal(store.read().snapshot.url, '');
        assert.equal(store.read().activeRequestId, null);
    });
});
