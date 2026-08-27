import * as assert from 'node:assert/strict';
import type { PanelMessage } from '../core/messages';
import {
    mountWebview,
    type WebviewHarness,
    type as typeInto,
    webviewState,
} from './webviewHarness';
function urlInputOf(harness: WebviewHarness): HTMLInputElement {
    const input = harness.window.document.querySelector<HTMLInputElement>('.url-input');
    assert.ok(input, 'expected the url bar to render an input');
    return input;
}
function sendButtonOf(harness: WebviewHarness): HTMLButtonElement {
    const button = harness.window.document.querySelector<HTMLButtonElement>('.send-btn');
    assert.ok(button, 'expected the url bar to render a send button');
    return button;
}
function lastOf(posted: PanelMessage[], type: PanelMessage['type']): PanelMessage | undefined {
    return [...posted].reverse().find((message) => message.type === type);
}
suite('webview request flow', () => {
    let harness: WebviewHarness;
    setup(() => {
        harness = mountWebview();
    });
    teardown(() => {
        harness.dispose();
    });
    function mountUrlBar(): void {
        const bar = harness.createUrlBar({
            onSend: harness.actions.send,
            onCancel: harness.actions.cancel,
        });
        harness.window.document.getElementById('root')?.appendChild(bar);
    }
    test('sends a URL typed after another request was loaded into the panel', () => {
        harness.store.hydrate(webviewState({ url: 'https://api.example.com/seed' }, 'req-seed'));
        mountUrlBar();
        // The panel now loads a freshly created request, which starts with no URL.
        harness.store.hydrate(webviewState({}, 'req-new'));
        harness.store.emit('method', 'url', 'params', 'headers', 'body', 'auth');
        const input = urlInputOf(harness);
        assert.equal(input.value, '', 'the url field must show the request that was just loaded');
        typeInto(input, 'http://localhost:5208/apartamentos');
        sendButtonOf(harness).click();
        const notified = lastOf(harness.posted, 'notify');
        assert.equal(notified, undefined, `unexpected warning: ${JSON.stringify(notified)}`);
        const sent = lastOf(harness.posted, 'send');
        assert.ok(sent && sent.type === 'send');
        assert.equal(sent.snapshot.url, 'http://localhost:5208/apartamentos');
    });
    test('warns only when the URL is really empty', () => {
        harness.store.hydrate(webviewState({}, 'req-new'));
        mountUrlBar();
        typeInto(urlInputOf(harness), '   ');
        sendButtonOf(harness).click();
        const notified = lastOf(harness.posted, 'notify');
        assert.ok(notified && notified.type === 'notify');
        assert.equal(notified.text, harness.actions.EMPTY_URL_MESSAGE);
        assert.equal(lastOf(harness.posted, 'send'), undefined);
    });
    test('sends the method picked after a request was loaded', () => {
        harness.store.hydrate(webviewState({ url: 'https://api.example.com/seed' }, 'req-seed'));
        mountUrlBar();
        harness.store.hydrate(webviewState({ url: 'https://api.example.com/new' }, 'req-new'));
        harness.store.emit('method', 'url');
        harness.store.state.snapshot.method = 'POST';
        sendButtonOf(harness).click();
        const sent = lastOf(harness.posted, 'send');
        assert.ok(sent && sent.type === 'send');
        assert.equal(sent.snapshot.method, 'POST');
        assert.equal(sent.snapshot.url, 'https://api.example.com/new');
    });
    test('edits query parameters of the request that is currently loaded', () => {
        harness.store.hydrate(
            webviewState(
                {
                    url: 'https://api.example.com/seed',
                    params: [{ id: 'seed', key: 'old', value: '1', enabled: true }],
                },
                'req-seed'
            )
        );
        const editor = harness.createRequestEditor();
        harness.window.document.getElementById('root')?.appendChild(editor);
        harness.store.hydrate(
            webviewState(
                {
                    url: 'https://api.example.com/new',
                    params: [{ id: 'fresh', key: 'page', value: '', enabled: true }],
                },
                'req-new'
            )
        );
        harness.store.emit('params');
        const keys = harness.window.document.querySelectorAll<HTMLInputElement>('.kv-key');
        assert.equal(keys.length, 1);
        assert.equal(keys[0].value, 'page');
        const values = harness.window.document.querySelectorAll<HTMLInputElement>('.kv-value');
        typeInto(values[0], '2');
        assert.equal(harness.store.state.snapshot.params[0].value, '2');
        assert.equal(harness.store.state.snapshot.params[0].key, 'page');
    });
});
