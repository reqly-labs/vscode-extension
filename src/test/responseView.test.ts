import * as assert from 'node:assert/strict';
import type { HttpResponse } from '../core/types';
import { mountWebview, webviewState, type WebviewHarness } from './webviewHarness';

const MB = 1024 * 1024;

function response(overrides: Partial<HttpResponse>): HttpResponse {
    return {
        status: 200,
        statusText: 'OK',
        httpVersion: '1.1',
        headers: [],
        size: 0,
        timings: { dns: 0, connect: 0, tls: 0, wait: 0, download: 0, total: 0 },
        contentType: 'text/plain',
        body: '',
        shown: 0,
        previewUri: null,
        binary: false,
        truncated: false,
        capped: false,
        redirects: [],
        finalUrl: 'http://localhost/',
        ...overrides,
    };
}

suite('response body pane', () => {
    let harness: WebviewHarness;
    let view: HTMLElement;

    setup(() => {
        harness = mountWebview();
        view = harness.createResponseView();
        harness.window.document.body.appendChild(view);
    });

    teardown(() => {
        harness.dispose();
    });

    function show(value: HttpResponse): string {
        harness.store.mutate((draft) => {
            draft.loading = false;
            draft.error = null;
            draft.response = value;
        });

        return view.querySelector('.response-body-pane')?.textContent ?? '';
    }

    test('says a response without a body has no body', () => {
        const text = show(response({ status: 204, statusText: 'No Content' }));

        assert.match(text, /The response has no body\./);
        assert.doesNotMatch(text, /too large/);
    });

    test('says how much of a large text body is on screen', () => {
        const text = show(
            response({
                body: 'a'.repeat(64),
                shown: 5 * MB,
                size: 20 * MB,
                truncated: true,
            })
        );

        assert.match(text, /Showing the first 5\.00 MB of 20\.00 MB\./);
        assert.match(text, /Save writes the whole body to disk\./);
    });

    test('says both how much is shown and where the download stopped', () => {
        const text = show(
            response({
                body: 'a'.repeat(64),
                shown: 5 * MB,
                size: 50 * MB,
                truncated: true,
                capped: true,
            })
        );

        assert.match(text, /Showing the first 5\.00 MB of 50\.00 MB\./);
        assert.match(text, /The download stopped at 50\.00 MB\./);
    });

    test('does not claim to show part of a large binary body', () => {
        const text = show(
            response({
                contentType: 'application/octet-stream',
                binary: true,
                shown: 5 * MB,
                size: 20 * MB,
                truncated: true,
            })
        );

        assert.match(text, /Binary response/);
        assert.doesNotMatch(text, /Showing the first/);
        assert.match(text, /Save writes the whole body to disk\./);
    });
});

suite('response panel follows the store', () => {
    let harness: WebviewHarness;
    let view: HTMLElement;

    setup(() => {
        harness = mountWebview();
        view = harness.createResponseView();
        harness.window.document.body.appendChild(view);
        harness.store.mutate((draft) => {
            draft.loading = false;
            draft.error = null;
            draft.response = response({
                contentType: 'application/json',
                body: '{"a":1}',
                size: 7,
                shown: 7,
                headers: [['content-type', 'application/json']],
            });
        });
    });

    teardown(() => {
        harness.dispose();
    });

    function activeTab(): string | undefined {
        return view.querySelector<HTMLElement>('.tab.is-active')?.dataset.id;
    }

    function visiblePane(): string {
        return view.querySelector('.pane-host')?.firstElementChild?.className ?? '';
    }

    function button(label: string): HTMLElement {
        const match = [...view.querySelectorAll<HTMLElement>('.meta-actions .ghost-btn')].find(
            (entry) => entry.textContent === label
        );

        assert.ok(match, `expected a ${label} button`);

        return match;
    }

    function bodyText(): string {
        return view.querySelector('.code-layer')?.textContent ?? '';
    }

    test('shows the pane the store names, whoever wrote it', () => {
        harness.store.mutate((draft) => {
            draft.activeResponseTab = 'headers';
        });

        assert.equal(activeTab(), 'headers');
        assert.match(visiblePane(), /response-headers/);
    });

    test('keeps the tab chosen in a loaded request once its response arrives', () => {
        harness.store.hydrate({ ...webviewState({}), activeResponseTab: 'timeline' });
        harness.store.mutate((draft) => {
            draft.response = response({ body: 'ok', size: 2, shown: 2 });
        });

        assert.equal(activeTab(), 'timeline');
        assert.match(visiblePane(), /response-timeline/);
    });

    test('redraws the body when pretty printing changes in the store', () => {
        assert.equal(bodyText(), '{\n  "a": 1\n}');
        assert.ok(button('Pretty').classList.contains('is-active'));

        harness.store.mutate((draft) => {
            draft.prettyPrint = false;
        });

        assert.equal(bodyText(), '{"a":1}');
        assert.equal(button('Pretty').classList.contains('is-active'), false);
    });

    test('writes a click on Pretty or Wrap to the store and draws from it', () => {
        button('Pretty').click();
        assert.equal(harness.store.getState().prettyPrint, false);
        assert.equal(bodyText(), '{"a":1}');

        button('Wrap').click();
        assert.equal(harness.store.getState().wrapLines, false);
        assert.equal(view.querySelector('.code-editor')?.classList.contains('is-wrapped'), false);
    });
});
