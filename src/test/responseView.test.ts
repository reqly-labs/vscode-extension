import * as assert from 'node:assert/strict';
import type { HttpResponse } from '../core/types';
import { mountWebview, type WebviewHarness } from './webviewHarness';

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
