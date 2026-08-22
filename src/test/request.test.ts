import * as assert from 'node:assert/strict';
import { buildCurlCommand, parseCurlCommand } from '../core/curl';
import { formatBytes, formatJson, formatXml } from '../core/format';
import { createSnapshot, type RequestSnapshot } from '../core/types';
import { buildRequest } from '../http/buildRequest';
function snapshotWith(patch: Partial<RequestSnapshot>): RequestSnapshot {
    return { ...createSnapshot(), ...patch };
}
suite('curl', () => {
    test('parses a POST with headers and a JSON body', () => {
        const parsed = parseCurlCommand(`curl -X POST 'https://api.example.com/users' \\
              -H 'Content-Type: application/json' \\
              -H 'Authorization: Bearer abc123' \\
              -d '{"name":"Ada"}'`);
        assert.ok(parsed);
        assert.equal(parsed.method, 'POST');
        assert.equal(parsed.url, 'https://api.example.com/users');
        assert.equal(parsed.headers['Content-Type'], 'application/json');
        assert.equal(parsed.headers['Authorization'], 'Bearer abc123');
        assert.equal(parsed.data, '{"name":"Ada"}');
    });
    test('infers POST when only data is given', () => {
        const parsed = parseCurlCommand(`curl https://example.com -d hello`);
        assert.equal(parsed?.method, 'POST');
    });
    test('reads multipart fields, marking @paths as files', () => {
        const parsed = parseCurlCommand(
            `curl https://example.com/upload -F 'title=Report' -F 'file=@/tmp/report.pdf'`
        );
        assert.equal(parsed?.multipartFields?.length, 2);
        assert.equal(parsed?.multipartFields?.[0].type, 'text');
        assert.equal(parsed?.multipartFields?.[1].type, 'file');
        assert.equal(parsed?.multipartFields?.[1].filePath, '/tmp/report.pdf');
    });
    test('ignores text that is not a curl command', () => {
        assert.equal(parseCurlCommand('https://example.com'), null);
    });
    test('round-trips a request back into a curl command', () => {
        const snapshot = snapshotWith({
            method: 'POST',
            url: 'https://api.example.com/users',
            bodyType: 'json',
            body: '{"name":"Ada"}',
            auth: { type: 'bearer', token: 'abc123', prefix: 'Bearer' },
        });
        const command = buildCurlCommand(snapshot);
        assert.match(command, /-X POST/);
        assert.match(command, /Authorization: Bearer abc123/);
        assert.match(command, /Content-Type: application\/json/);
    });
});
suite('buildRequest', () => {
    test('applies query parameters and skips disabled rows', async () => {
        const wire = await buildRequest(
            snapshotWith({
                url: 'https://api.example.com/search',
                params: [
                    { id: '1', key: 'q', value: 'ducks', enabled: true },
                    { id: '2', key: 'page', value: '2', enabled: false },
                ],
            })
        );
        assert.equal(wire.url.searchParams.get('q'), 'ducks');
        assert.equal(wire.url.searchParams.get('page'), null);
    });
    test('encodes basic auth into an Authorization header', async () => {
        const wire = await buildRequest(
            snapshotWith({
                url: 'https://api.example.com',
                auth: { type: 'basic', username: 'ada', password: 'lovelace' },
            })
        );
        assert.equal(
            wire.headers['Authorization'],
            `Basic ${Buffer.from('ada:lovelace').toString('base64')}`
        );
    });
    test('places an API key in the query string when asked to', async () => {
        const wire = await buildRequest(
            snapshotWith({
                url: 'https://api.example.com',
                auth: { type: 'api-key', key: 'token', value: 'xyz', addTo: 'query' },
            })
        );
        assert.equal(wire.url.searchParams.get('token'), 'xyz');
        assert.equal(wire.headers['token'], undefined);
    });
    test('does not attach a body to GET requests', async () => {
        const wire = await buildRequest(
            snapshotWith({ url: 'https://api.example.com', bodyType: 'json', body: '{"a":1}' })
        );
        assert.equal(wire.body, undefined);
    });
    test('keeps a user-supplied Content-Type over the inferred one', async () => {
        const wire = await buildRequest(
            snapshotWith({
                method: 'POST',
                url: 'https://api.example.com',
                bodyType: 'json',
                body: '{"a":1}',
                headers: [
                    {
                        id: '1',
                        key: 'content-type',
                        value: 'application/vnd.api+json',
                        enabled: true,
                    },
                ],
            })
        );
        assert.equal(wire.headers['content-type'], 'application/vnd.api+json');
        assert.equal(wire.headers['Content-Type'], undefined);
    });
    test('prefixes a bare host with https', async () => {
        const wire = await buildRequest(snapshotWith({ url: 'api.example.com/health' }));
        assert.equal(wire.url.toString(), 'https://api.example.com/health');
    });
    test('rejects an empty URL', async () => {
        await assert.rejects(() => buildRequest(snapshotWith({ url: '   ' })));
    });
});
suite('format', () => {
    test('scales byte counts', () => {
        assert.equal(formatBytes(512), '512 B');
        assert.equal(formatBytes(2048), '2.0 KB');
    });
    test('indents JSON and leaves invalid input untouched', () => {
        assert.equal(formatJson('{"a":1}'), '{\n  "a": 1\n}');
        assert.equal(formatJson('not json'), 'not json');
    });
    test('indents nested XML', () => {
        assert.equal(formatXml('<a><b>1</b></a>'), '<a>\n  <b>\n    1\n  </b>\n</a>');
    });
});
