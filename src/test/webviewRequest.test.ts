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

suite('webview hydration', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
    });

    teardown(() => {
        harness.dispose();
    });

    function query<T extends Element>(selector: string): T {
        const node = harness.window.document.querySelector<T>(selector);

        assert.ok(node, `expected the panel to render "${selector}"`);

        return node;
    }

    function queryAll<T extends Element>(selector: string): T[] {
        return [...harness.window.document.querySelectorAll<T>(selector)];
    }

    function clickTab(label: string): void {
        const tab = queryAll<HTMLButtonElement>('.tab').find((node) =>
            (node.textContent ?? '').startsWith(label)
        );

        assert.ok(tab, `expected a "${label}" tab`);
        tab.click();
    }

    function mountPanel(): void {
        const root = harness.window.document.getElementById('root');

        assert.ok(root);
        root.appendChild(
            harness.createUrlBar({ onSend: harness.actions.send, onCancel: harness.actions.cancel })
        );
        root.appendChild(harness.createRequestEditor());
    }

    test('repaints every part of the panel when another request is loaded', () => {
        harness.store.hydrate(
            webviewState(
                {
                    method: 'GET',
                    url: 'https://api.example.com/seed',
                    params: [{ id: 'p0', key: 'old', value: '0', enabled: true }],
                    headers: [{ id: 'h0', key: 'X-Old', value: 'old', enabled: true }],
                    bodyType: 'none',
                    auth: { type: 'none' },
                },
                'req-seed'
            ),
            { id: 'req-seed', name: 'Seed', location: '' }
        );
        mountPanel();

        harness.store.hydrate(
            {
                ...webviewState(
                    {
                        method: 'POST',
                        url: 'https://api.example.com/apartamentos',
                        params: [{ id: 'p1', key: 'page', value: '2', enabled: true }],
                        headers: [{ id: 'h1', key: 'X-New', value: 'new', enabled: true }],
                        bodyType: 'json',
                        body: '{"a":1}',
                        auth: { type: 'bearer', token: 'abc', prefix: 'Bearer' },
                    },
                    'req-new'
                ),
                settings: {
                    timeout: 12000,
                    followRedirects: false,
                    rejectUnauthorized: false,
                    maxResponseSize: 8 * 1024 * 1024,
                },
            },
            { id: 'req-new', name: 'Listar', location: 'Catálogo' }
        );

        assert.equal(
            query<HTMLInputElement>('.url-input').value,
            'https://api.example.com/apartamentos'
        );
        assert.equal(query('.select-method .select-label').textContent, 'POST');

        assert.deepEqual(
            queryAll<HTMLInputElement>('.kv-key').map((node) => node.value),
            ['page']
        );

        clickTab('Headers');
        assert.deepEqual(
            queryAll<HTMLInputElement>('.kv-key').map((node) => node.value),
            ['X-New']
        );

        clickTab('Body');
        assert.equal(query('.body-tab .select-label').textContent, 'JSON');

        clickTab('Auth');
        assert.equal(query('.pane .select-label').textContent, 'Bearer Token');

        const numbers = queryAll<HTMLInputElement>('.settings-popup input[type="number"]');

        assert.deepEqual(
            numbers.map((node) => node.value),
            ['12000', '8']
        );

        const toggles = queryAll<HTMLInputElement>('.settings-popup input[type="checkbox"]');

        assert.deepEqual(
            toggles.map((node) => node.checked),
            [false, false]
        );
    });

    test('leaves nothing behind from the request that was open before', () => {
        harness.store.hydrate(
            webviewState(
                {
                    url: 'https://api.example.com/seed',
                    params: [
                        { id: 'p0', key: 'a', value: '1', enabled: true },
                        { id: 'p1', key: 'b', value: '2', enabled: true },
                    ],
                },
                'req-seed'
            ),
            { id: 'req-seed', name: 'Seed', location: '' }
        );
        mountPanel();

        harness.store.hydrate(webviewState({ url: 'https://api.example.com/new' }, 'req-new'), {
            id: 'req-new',
            name: 'Listar',
            location: '',
        });

        const keys = queryAll<HTMLInputElement>('.kv-key');

        assert.equal(keys.length, 1);
        assert.equal(keys[0].value, '');
    });
});
