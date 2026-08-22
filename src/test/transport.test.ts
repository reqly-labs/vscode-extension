import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import type { HttpResponse, RequestSettings, RequestSnapshot } from '../core/types';
import { createSettings, createSnapshot } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import { decodeResponse } from '../http/decodeResponse';
import { executeRequest } from '../http/executeRequest';
interface Received {
    method: string;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}
suite('transport', () => {
    let server: http.Server;
    let base: string;
    let received: Received[] = [];
    suiteSetup(async () => {
        server = http.createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
                received.push({
                    method: request.method ?? '',
                    headers: request.headers,
                    body: Buffer.concat(chunks),
                });
                const path = new URL(request.url ?? '/', 'http://localhost').pathname;
                if (path === '/gzip') {
                    response.writeHead(200, {
                        'content-type': 'application/json',
                        'content-encoding': 'gzip',
                    });
                    response.end(gzipSync(Buffer.from('{"hello":"world"}')));
                    return;
                }
                if (path === '/redirect') {
                    response.writeHead(303, { location: '/final' });
                    response.end();
                    return;
                }
                if (path === '/final') {
                    response.writeHead(200, { 'content-type': 'text/plain' });
                    response.end('arrived');
                    return;
                }
                if (path === '/latin1') {
                    response.writeHead(200, { 'content-type': 'text/plain; charset=iso-8859-1' });
                    response.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
                    return;
                }
                response.writeHead(404, { 'content-type': 'text/plain' });
                response.end('missing');
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    suiteTeardown(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    setup(() => {
        received = [];
    });
    async function send(
        patch: Partial<RequestSnapshot>,
        settings: RequestSettings = createSettings()
    ): Promise<HttpResponse> {
        const snapshot = { ...createSnapshot(), ...patch };
        const wire = await buildRequest(snapshot);
        const raw = await executeRequest(wire, settings, new AbortController().signal);
        return decodeResponse(raw);
    }
    test('decompresses a gzipped response', async () => {
        const response = await send({ url: `${base}/gzip` });
        assert.equal(response.status, 200);
        assert.equal(response.body, '{"hello":"world"}');
    });
    test('decodes text using the charset the server declared', async () => {
        const response = await send({ url: `${base}/latin1` });
        assert.equal(response.body, 'café');
    });
    test('reports a 404 as a response rather than an error', async () => {
        const response = await send({ url: `${base}/missing` });
        assert.equal(response.status, 404);
        assert.equal(response.body, 'missing');
    });
    test('follows a 303 as a GET without the original body', async () => {
        const response = await send({
            method: 'POST',
            url: `${base}/redirect`,
            bodyType: 'json',
            body: '{"a":1}',
        });
        assert.equal(response.status, 200);
        assert.equal(response.body, 'arrived');
        assert.deepEqual(response.redirects.length, 1);
        assert.match(response.finalUrl, /\/final$/);
        const last = received.at(-1);
        assert.equal(last?.method, 'GET');
        assert.equal(last?.headers['content-type'], undefined);
        assert.equal(last?.body.byteLength, 0);
    });
    test('stops at the redirect when following is turned off', async () => {
        const response = await send(
            { url: `${base}/redirect` },
            { ...createSettings(), followRedirects: false }
        );
        assert.equal(response.status, 303);
        assert.equal(response.redirects.length, 0);
    });
    test('keeps timing phases non-negative and within the total across hops', async () => {
        const { timings } = await send({ url: `${base}/redirect` });
        const phases =
            timings.dns + timings.connect + timings.tls + timings.wait + timings.download;
        assert.ok(
            Object.values(timings).every((value) => value >= 0),
            `a phase went negative: ${JSON.stringify(timings)}`
        );
        assert.ok(phases <= timings.total + 5, `phases ${phases} exceeded total ${timings.total}`);
    });
    test('surfaces a refused connection as a readable error', async () => {
        await assert.rejects(() => send({ url: 'http://127.0.0.1:1/nothing' }), /refused/i);
    });
});
