import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { createSettings, createSnapshot } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import { executeRequest, TransportError } from '../http/executeRequest';

const PAYLOAD = gzipSync(Buffer.alloc(512 * 1024, 0x61));

const PARTIAL = PAYLOAD.subarray(0, PAYLOAD.byteLength >> 1);

suite('a body that never finishes arriving', () => {
    let server: http.Server;
    let base: string;

    suiteSetup(async () => {
        server = http.createServer((request, response) => {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;
            const compressed = path.startsWith('/gzip');

            response.writeHead(
                200,
                compressed
                    ? { 'content-type': 'text/plain', 'content-encoding': 'gzip' }
                    : { 'content-type': 'text/plain', 'content-length': '10000000' }
            );
            response.write(compressed ? PARTIAL : Buffer.alloc(64 * 1024, 0x62));

            if (path.endsWith('/drop')) {
                setTimeout(() => response.socket?.destroy(), 50);
            }
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    suiteTeardown(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function fetch(path: string, signal: AbortSignal, timeout = 5000): Promise<unknown> {
        return executeRequest(
            await buildRequest({ ...createSnapshot(), url: `${base}${path}` }),
            { ...createSettings(), timeout },
            signal
        );
    }

    function failsWith(message: string): (error: unknown) => boolean {
        return (error) => error instanceof TransportError && error.message === message;
    }

    for (const encoding of ['plain', 'gzip']) {
        test(`reports a ${encoding} connection that drops mid-body`, async () => {
            await assert.rejects(
                fetch(`/${encoding}/drop`, new AbortController().signal),
                failsWith('The connection closed before the whole response arrived.')
            );
        });

        test(`times out a ${encoding} body that stalls`, async () => {
            await assert.rejects(
                fetch(`/${encoding}/stall`, new AbortController().signal, 300),
                failsWith('Request timed out after 300 ms.')
            );
        });

        test(`cancels a ${encoding} body while it is downloading`, async () => {
            const controller = new AbortController();

            setTimeout(() => controller.abort(), 100);
            await assert.rejects(
                fetch(`/${encoding}/stall`, controller.signal),
                failsWith('Request cancelled.')
            );
        });
    }
});
