import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { DEFAULT_MAX_RESPONSE_BYTES, MAX_PREVIEW_BYTES } from '../core/constants';
import { createSettings, createSnapshot, type RequestSettings } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import { decodeResponse } from '../http/decodeResponse';
import { executeRequest, type RawResponse } from '../http/executeRequest';

const CHUNK = 64 * 1024;
const TOTAL_CHUNKS = 40;
const PAYLOAD = Buffer.alloc(CHUNK, 0x61);
const BOMB_PLAIN = Buffer.alloc(8 * 1024 * 1024, 0x62);

suite('response size limit', () => {
    let server: http.Server;
    let base: string;

    suiteSetup(async () => {
        server = http.createServer((request, response) => {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;

            if (path === '/bomb') {
                response.writeHead(200, {
                    'content-type': 'text/plain',
                    'content-encoding': 'gzip',
                });
                response.end(gzipSync(BOMB_PLAIN));

                return;
            }

            if (path === '/small') {
                response.writeHead(200, { 'content-type': 'text/plain' });
                response.end('tiny');

                return;
            }

            response.writeHead(200, { 'content-type': 'application/octet-stream' });

            let sent = 0;
            const pump = (): void => {
                while (sent < TOTAL_CHUNKS) {
                    sent += 1;

                    if (!response.write(PAYLOAD)) {
                        response.once('drain', pump);

                        return;
                    }
                }

                response.end();
            };

            pump();
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    suiteTeardown(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function fetch(path: string, settings: Partial<RequestSettings>): Promise<RawResponse> {
        return executeRequest(
            await buildRequest({ ...createSnapshot(), url: `${base}${path}` }),
            { ...createSettings(), ...settings },
            new AbortController().signal
        );
    }

    test('stops buffering once the limit is reached', async () => {
        const limit = 128 * 1024;
        const response = await fetch('/stream', { maxResponseSize: limit });

        assert.equal(response.capped, true);
        assert.equal(response.body.byteLength, limit);
    });

    test('never allocates more than the limit even for a much larger body', async () => {
        const limit = 64 * 1024;
        const response = await fetch('/stream', { maxResponseSize: limit });

        assert.ok(
            response.body.byteLength <= limit,
            `buffered ${response.body.byteLength} bytes past a ${limit} byte limit`
        );
    });

    test('measures the decompressed size, not the bytes on the wire', async () => {
        const limit = 256 * 1024;
        const compressed = gzipSync(BOMB_PLAIN).byteLength;

        assert.ok(compressed < limit, 'the fixture must be small enough to slip past a wire check');

        const response = await fetch('/bomb', { maxResponseSize: limit });

        assert.equal(response.capped, true);
        assert.equal(response.body.byteLength, limit);
    });

    test('leaves a response under the limit untouched', async () => {
        const response = await fetch('/stream', { maxResponseSize: DEFAULT_MAX_RESPONSE_BYTES });

        assert.equal(response.capped, false);
        assert.equal(response.body.byteLength, CHUNK * TOTAL_CHUNKS);
    });

    test('does not call a response that lands exactly on the limit truncated', async () => {
        const exact = CHUNK * TOTAL_CHUNKS;
        const response = await fetch('/stream', { maxResponseSize: exact });

        assert.equal(response.capped, false, 'a complete body was reported as cut short');
        assert.equal(response.body.byteLength, exact);
    });

    test('does not flag a small response', async () => {
        const response = await fetch('/small', { maxResponseSize: DEFAULT_MAX_RESPONSE_BYTES });

        assert.equal(response.capped, false);
        assert.equal(response.body.toString(), 'tiny');
    });

    test('falls back to the default when the limit is nonsense', async () => {
        for (const maxResponseSize of [0, -1, Number.NaN, 12]) {
            const response = await fetch('/small', { maxResponseSize });

            assert.equal(response.capped, false, `a limit of ${maxResponseSize} broke the request`);
            assert.equal(response.body.toString(), 'tiny');
        }
    });

    test('tells the response view that the body was cut short', async () => {
        const response = await fetch('/stream', { maxResponseSize: 128 * 1024 });
        const decoded = decodeResponse(response);

        assert.equal(decoded.capped, true);
        assert.equal(decoded.size, 128 * 1024);
    });

    test('keeps preview truncation separate from the download cap', async () => {
        const response = await fetch('/stream', { maxResponseSize: DEFAULT_MAX_RESPONSE_BYTES });
        const decoded = decodeResponse(response);

        assert.ok(decoded.size < MAX_PREVIEW_BYTES);
        assert.equal(decoded.truncated, false);
        assert.equal(decoded.capped, false);
    });
});
