import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { createSettings, createSnapshot } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import { executeRequest, TransportError } from '../http/executeRequest';

suite('request deadline', () => {
    let server: http.Server;
    let base: string;
    const timers: NodeJS.Timeout[] = [];

    suiteSetup(async () => {
        server = http.createServer((request, response) => {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;

            if (path === '/trickle') {
                response.writeHead(200, { 'content-type': 'text/plain' });

                const timer = setInterval(() => response.write('.'), 30);

                timers.push(timer);
                response.on('close', () => clearInterval(timer));

                return;
            }

            if (path === '/slow-hop') {
                const timer = setTimeout(() => {
                    response.writeHead(302, { location: '/slow-hop' });
                    response.end();
                }, 120);

                timers.push(timer);
                response.on('close', () => clearTimeout(timer));

                return;
            }

            if (path === '/silent') {
                return;
            }

            response.writeHead(200, { 'content-type': 'text/plain' });
            response.end('done');
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    suiteTeardown(async () => {
        timers.forEach((timer) => clearInterval(timer));
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function attempt(path: string, timeout: number): Promise<{ error: Error; ms: number }> {
        const started = Date.now();

        try {
            await executeRequest(
                await buildRequest({ ...createSnapshot(), url: `${base}${path}` }),
                { ...createSettings(), timeout },
                new AbortController().signal
            );
        } catch (error) {
            assert.ok(error instanceof Error);

            return { error, ms: Date.now() - started };
        }

        throw new Error(`expected ${path} to time out`);
    }

    test('gives up on a server that dribbles bytes forever', async () => {
        const { error, ms } = await attempt('/trickle', 400);

        assert.ok(error instanceof TransportError);
        assert.match(error.message, /timed out/);
        assert.ok(ms < 2000, `the deadline did not hold: took ${ms} ms`);
    });

    test('gives up on a server that never answers', async () => {
        const { error, ms } = await attempt('/silent', 300);

        assert.match(error.message, /timed out/);
        assert.ok(ms < 2000, `the deadline did not hold: took ${ms} ms`);
    });

    test('spends one budget across the whole redirect chain', async () => {
        const { error, ms } = await attempt('/slow-hop', 400);

        assert.match(error.message, /timed out/);
        assert.ok(ms < 2000, `each hop restarted the budget: took ${ms} ms`);
    });

    test('leaves a prompt response alone', async () => {
        const response = await executeRequest(
            await buildRequest({ ...createSnapshot(), url: `${base}/fast` }),
            { ...createSettings(), timeout: 5000 },
            new AbortController().signal
        );

        assert.equal(response.status, 200);
        assert.equal(response.body.toString(), 'done');
    });
});
