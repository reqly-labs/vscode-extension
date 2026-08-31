import * as assert from 'node:assert/strict';
import { createSettings, createSnapshot } from '../core/types';
import { applyCurl } from '../webview/curlImport';
import { getState, hydrate } from '../webview/store';

const state = () => getState();

function reset(): void {
    hydrate(
        {
            snapshot: createSnapshot(),
            settings: createSettings(),
            activeRequestTab: 'params',
            activeResponseTab: 'body',
            activeRequestId: null,
        },
        { id: null, name: '', location: '' }
    );
}

function enabledPairs(
    items: readonly { key: string; value: string; enabled: boolean }[]
): string[][] {
    return items.filter((item) => item.key).map((item) => [item.key, item.value]);
}

suite('cURL import', () => {
    setup(reset);

    test('takes the method, URL and headers', () => {
        assert.equal(
            applyCurl(`curl -X POST 'https://api.example.com/users' -H 'X-Trace: abc'`),
            true
        );
        assert.equal(state().snapshot.method, 'POST');
        assert.equal(state().snapshot.url, 'https://api.example.com/users');
        assert.deepEqual(enabledPairs(state().snapshot.headers), [['X-Trace', 'abc']]);
    });

    test('moves the query string out of the URL and into the params', () => {
        applyCurl(`curl 'https://api.example.com/search?q=ducks&page=2'`);

        assert.equal(state().snapshot.url, 'https://api.example.com/search');
        assert.deepEqual(enabledPairs(state().snapshot.params), [
            ['q', 'ducks'],
            ['page', '2'],
        ]);
    });

    test('leaves a URL without a query string alone', () => {
        applyCurl(`curl 'https://api.example.com/users'`);

        assert.equal(state().snapshot.url, 'https://api.example.com/users');
        assert.deepEqual(enabledPairs(state().snapshot.params), []);
    });

    test('formats a JSON body and marks it as JSON', () => {
        applyCurl(
            `curl -X POST https://api.example.com -H 'Content-Type: application/json' -d '{"name":"Ada"}'`
        );

        assert.equal(state().snapshot.bodyType, 'json');
        assert.match(state().snapshot.body, /"name": "Ada"/);
    });

    test('infers JSON from the payload when no content type says so', () => {
        applyCurl(`curl https://api.example.com -d '{"name":"Ada"}'`);

        assert.equal(state().snapshot.bodyType, 'json');
    });

    test('falls back to text for a payload that is not JSON', () => {
        applyCurl(`curl https://api.example.com -d 'just words'`);

        assert.equal(state().snapshot.bodyType, 'text');
        assert.equal(state().snapshot.body, 'just words');
    });

    test('splits a urlencoded body into form rows and clears the raw body', () => {
        applyCurl(
            `curl -X POST https://api.example.com -H 'Content-Type: application/x-www-form-urlencoded' -d 'name=Ada&role=admin'`
        );

        assert.equal(state().snapshot.bodyType, 'form');
        assert.equal(state().snapshot.body, '');
        assert.deepEqual(enabledPairs(state().snapshot.formBody), [
            ['name', 'Ada'],
            ['role', 'admin'],
        ]);
    });

    test('keeps multipart fields, including file attachments', () => {
        applyCurl(`curl https://api.example.com/upload -F 'title=Report' -F 'file=@/tmp/r.pdf'`);

        assert.equal(state().snapshot.bodyType, 'multipart');
        assert.deepEqual(
            state().snapshot.multipartBody.map((field) => [field.key, field.type]),
            [
                ['title', 'text'],
                ['file', 'file'],
            ]
        );
        assert.equal(state().snapshot.multipartBody[1].filePath, '/tmp/r.pdf');
    });

    test('says a request without a payload has no body', () => {
        applyCurl(`curl https://api.example.com`);

        assert.equal(state().snapshot.bodyType, 'none');
        assert.equal(state().snapshot.body, '');
    });

    test('refuses text that is not a curl command and changes nothing', () => {
        applyCurl(`curl -X PUT https://api.example.com/first -d 'kept'`);

        const before = JSON.stringify(state().snapshot);

        assert.equal(applyCurl('https://example.com'), false);
        assert.equal(JSON.stringify(state().snapshot), before);
    });

    test('leaves nothing behind from the request it replaced', () => {
        applyCurl(
            `curl -X POST 'https://api.example.com/a?old=1' -H 'X-Old: 1' -F 'part=@/tmp/a.bin'`
        );
        applyCurl(`curl 'https://api.example.com/b'`);

        assert.equal(state().snapshot.url, 'https://api.example.com/b');
        assert.equal(state().snapshot.method, 'GET');
        assert.deepEqual(enabledPairs(state().snapshot.params), []);
        assert.deepEqual(enabledPairs(state().snapshot.headers), []);
        assert.equal(state().snapshot.bodyType, 'none');
        assert.deepEqual(enabledPairs(state().snapshot.multipartBody), []);
        assert.deepEqual(enabledPairs(state().snapshot.formBody), []);
    });

    test('opens the tab that has something in it', () => {
        applyCurl(`curl 'https://api.example.com?q=1'`);
        assert.equal(state().activeRequestTab, 'params');

        reset();
        applyCurl(`curl 'https://api.example.com' -H 'X-Trace: abc'`);
        assert.equal(state().activeRequestTab, 'headers');

        reset();
        applyCurl(`curl https://api.example.com -d '{"a":1}'`);
        assert.equal(state().activeRequestTab, 'body');
    });

    test('imports an Authorization header as a header, not as configured auth', () => {
        applyCurl(`curl https://api.example.com -H 'Authorization: Bearer abc123'`);

        assert.equal(state().snapshot.auth.type, 'none');
        assert.deepEqual(enabledPairs(state().snapshot.headers), [
            ['Authorization', 'Bearer abc123'],
        ]);
    });
});
