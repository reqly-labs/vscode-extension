import * as assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { DEFAULT_MAX_RESPONSE_BYTES } from '../core/constants';
import { createSettings, createSnapshot, type RequestSettings } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import { decodeResponse } from '../http/decodeResponse';
import { executeRequest, type RawResponse } from '../http/executeRequest';
import { createResponseSink, removeSpill } from '../http/responseSink';

const HEAD_BYTES = 64 * 1024;

const CHUNK = 32 * 1024;

const TOTAL_CHUNKS = 8;

const TOTAL_BYTES = CHUNK * TOTAL_CHUNKS;

suite('a body larger than the preview limit', () => {
    let server: http.Server;
    let base: string;
    const spills: (string | null)[] = [];

    suiteSetup(async () => {
        server = http.createServer((request, response) => {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;

            response.writeHead(200, {
                'content-type': path === '/text' ? 'text/plain' : 'application/octet-stream',
            });

            let sent = 0;
            const pump = (): void => {
                while (sent < TOTAL_CHUNKS) {
                    const byte = 0x61 + (sent % 26);

                    sent += 1;
                    if (!response.write(Buffer.alloc(CHUNK, byte))) {
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
        await Promise.all(spills.map((path) => removeSpill(path)));
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function fetch(
        path: string,
        settings: Partial<RequestSettings> = {}
    ): Promise<RawResponse> {
        const response = await executeRequest(
            await buildRequest({ ...createSnapshot(), url: `${base}${path}` }),
            { ...createSettings(), maxResponseSize: DEFAULT_MAX_RESPONSE_BYTES, ...settings },
            new AbortController().signal
        );

        spills.push(response.spillPath);

        return response;
    }

    test('keeps only the head in memory and writes the rest to disk', async () => {
        const sink = createResponseSink(HEAD_BYTES);

        for (let index = 0; index < TOTAL_CHUNKS; index += 1) {
            sink.push(Buffer.alloc(CHUNK, 0x61 + index));
        }

        const body = await sink.finish();

        spills.push(body.spillPath);
        assert.equal(body.size, TOTAL_BYTES);
        assert.equal(body.head.byteLength, HEAD_BYTES);
        assert.ok(body.spillPath, 'a body past the head limit must be written to disk');
        assert.equal((await stat(body.spillPath)).size, TOTAL_BYTES);
    });

    test('writes the whole body to disk, not only the part past the head', async () => {
        const sink = createResponseSink(HEAD_BYTES);

        sink.push(Buffer.alloc(HEAD_BYTES, 0x41));
        sink.push(Buffer.alloc(CHUNK, 0x42));

        const body = await sink.finish();

        spills.push(body.spillPath);
        assert.ok(body.spillPath);

        const written = await readFile(body.spillPath);

        assert.equal(written.byteLength, HEAD_BYTES + CHUNK);
        assert.equal(
            written.subarray(0, HEAD_BYTES).every((byte) => byte === 0x41),
            true
        );
        assert.equal(
            written.subarray(HEAD_BYTES).every((byte) => byte === 0x42),
            true
        );
    });

    test('leaves a body under the head limit entirely in memory', async () => {
        const sink = createResponseSink(HEAD_BYTES);

        sink.push(Buffer.from('tiny'));

        const body = await sink.finish();

        assert.equal(body.spillPath, null);
        assert.equal(body.head.toString(), 'tiny');
        assert.equal(body.size, 4);
    });

    test('throws the spill file away when it is discarded', async () => {
        const sink = createResponseSink(HEAD_BYTES);

        sink.push(Buffer.alloc(HEAD_BYTES + CHUNK, 0x43));
        await sink.discard();

        const body = await sink.finish();

        assert.equal(body.spillPath, null);
    });

    test('reports the full size even though only the head was kept', async () => {
        const response = await fetch('/text');

        assert.equal(response.size, TOTAL_BYTES);
        assert.equal(response.capped, false);
    });

    test('previews the head of a text body that is too large to hold', async () => {
        const response = await fetch('/text');
        const partial: RawResponse = { ...response, body: response.body.subarray(0, HEAD_BYTES) };
        const decoded = decodeResponse(partial);

        assert.equal(decoded.truncated, true);
        assert.equal(decoded.binary, false);
        assert.equal(decoded.size, TOTAL_BYTES);
        assert.equal(decoded.shown, HEAD_BYTES);
        assert.equal(decoded.body.length, HEAD_BYTES);
    });

    test('offers no text preview for a binary body that was cut for the preview', async () => {
        const response = await fetch('/binary');
        const partial: RawResponse = { ...response, body: response.body.subarray(0, HEAD_BYTES) };
        const decoded = decodeResponse(partial);

        assert.equal(decoded.truncated, true);
        assert.equal(decoded.binary, true);
        assert.equal(decoded.body, '');
    });

    test('says nothing was truncated when the whole body is in hand', async () => {
        const response = await fetch('/text');
        const decoded = decodeResponse(response);

        assert.equal(decoded.truncated, false);
        assert.equal(decoded.shown, decoded.size);
    });
});
