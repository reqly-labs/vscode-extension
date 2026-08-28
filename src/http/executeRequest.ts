import * as http from 'node:http';
import * as https from 'node:https';
import type { Duplex } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import {
    DEFAULT_MAX_RESPONSE_BYTES,
    MAX_REDIRECTS,
    MIN_MAX_RESPONSE_BYTES,
} from '../core/constants';
import type { HttpMethod, RequestSettings, ResponseTimings } from '../core/types';
import type { WireRequest } from './buildRequest';
import { trustedCertificates } from './certificates';

export class TransportError extends Error {
    constructor(
        message: string,
        readonly detail?: string
    ) {
        super(message);
    }
}

export interface RawResponse {
    capped: boolean;
    status: number;
    statusText: string;
    httpVersion: string;
    headers: [string, string][];
    body: Buffer;
    timings: ResponseTimings;
    redirects: string[];
    finalUrl: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function decompressor(encoding: string | undefined): Duplex | null {
    switch (encoding?.trim().toLowerCase()) {
        case 'gzip':
        case 'x-gzip':
            return createGunzip();
        case 'deflate':
            return createInflate();
        case 'br':
            return createBrotliDecompress();
        default:
            return null;
    }
}

function collectHeaders(raw: string[]): [string, string][] {
    const headers: [string, string][] = [];

    for (let i = 0; i < raw.length; i += 2) {
        headers.push([raw[i], raw[i + 1]]);
    }

    return headers;
}

function headerValue(headers: [string, string][], name: string): string | undefined {
    const lower = name.toLowerCase();

    return headers.find(([key]) => key.toLowerCase() === lower)?.[1];
}

function headersForRedirect(
    headers: Record<string, string>,
    from: URL,
    to: URL,
    keepBody: boolean
): Record<string, string> {
    const sameOrigin = from.origin === to.origin;
    const next: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
        const lower = key.toLowerCase();

        if (!sameOrigin && (lower === 'authorization' || lower === 'cookie')) {
            continue;
        }

        if (!keepBody && (lower === 'content-length' || lower === 'content-type')) {
            continue;
        }

        next[key] = value;
    }

    return next;
}

interface Exchange {
    capped: boolean;
    status: number;
    statusText: string;
    httpVersion: string;
    headers: [string, string][];
    body: Buffer;
    timings: ResponseTimings;
}

function performExchange(
    url: URL,
    method: HttpMethod,
    headers: Record<string, string>,
    body: Buffer | undefined,
    settings: RequestSettings,
    signal: AbortSignal,
    deadline: number
): Promise<Exchange> {
    return new Promise<Exchange>((resolve, reject) => {
        const secure = url.protocol === 'https:';
        const transport = secure ? https : http;
        const start = performance.now();
        const marks = { dns: 0, connect: 0, tls: 0, firstByte: 0 };
        const request = transport.request(
            url,
            {
                method,
                headers,
                rejectUnauthorized: settings.rejectUnauthorized,
                ca: secure ? trustedCertificates() : undefined,
                signal,
            },
            (response) => {
                marks.firstByte = performance.now() - start;
                const rawHeaders = collectHeaders(response.rawHeaders);
                const decoder = decompressor(headerValue(rawHeaders, 'content-encoding'));
                const stream = decoder ? response.pipe(decoder) : response;
                const limit = responseLimit(settings);
                const chunks: Buffer[] = [];
                let received = 0;
                let capped = false;

                const deliver = () =>
                    resolve({
                        capped,
                        status: response.statusCode ?? 0,
                        statusText: response.statusMessage ?? '',
                        httpVersion: response.httpVersion,
                        headers: rawHeaders,
                        body: Buffer.concat(chunks),
                        timings: durations(marks, performance.now() - start),
                    });

                stream.on('data', (chunk: Buffer) => {
                    if (capped) {
                        return;
                    }

                    const room = limit - received;

                    if (chunk.byteLength <= room) {
                        chunks.push(chunk);
                        received += chunk.byteLength;

                        return;
                    }

                    chunks.push(chunk.subarray(0, room));
                    received = limit;
                    capped = true;
                    request.destroy();
                    deliver();
                });
                stream.on('error', (error: NodeJS.ErrnoException) => {
                    if (capped) {
                        return;
                    }

                    reject(new TransportError('Failed to read the response body.', error.message));
                });
                stream.on('end', () => {
                    if (!capped) {
                        deliver();
                    }
                });
            }
        );

        const expire = () => {
            request.destroy(new TransportError(`Request timed out after ${settings.timeout} ms.`));
        };
        const budget = setTimeout(expire, Math.max(0, deadline - Date.now()));

        request.setTimeout(settings.timeout, expire);
        request.on('close', () => clearTimeout(budget));
        request.on('socket', (socket) => {
            if (!socket.connecting) {
                return;
            }

            socket.once('lookup', () => (marks.dns = performance.now() - start));
            socket.once('connect', () => (marks.connect = performance.now() - start));
            socket.once('secureConnect', () => (marks.tls = performance.now() - start));
        });
        request.on('error', (error: NodeJS.ErrnoException) => {
            if (error instanceof TransportError) {
                reject(error);

                return;
            }

            reject(toTransportError(error, url));
        });
        if (body) {
            request.write(body);
        }

        request.end();
    });
}

function responseLimit(settings: RequestSettings): number {
    const limit = Math.floor(settings.maxResponseSize);

    if (!Number.isFinite(limit) || limit < MIN_MAX_RESPONSE_BYTES) {
        return DEFAULT_MAX_RESPONSE_BYTES;
    }

    return limit;
}

function durations(
    marks: {
        dns: number;
        connect: number;
        tls: number;
        firstByte: number;
    },
    elapsed: number
): ResponseTimings {
    const span = (from: number, to: number) => Math.round(Math.max(0, to - from));
    const connected = Math.max(marks.tls, marks.connect, marks.dns);

    return {
        dns: span(0, marks.dns),
        connect: marks.connect > 0 ? span(marks.dns, marks.connect) : 0,
        tls: marks.tls > 0 ? span(marks.connect, marks.tls) : 0,
        wait: span(connected, marks.firstByte),
        download: span(marks.firstByte, elapsed),
        total: Math.round(elapsed),
    };
}

function untrustedCertificate(message: string, error: NodeJS.ErrnoException): TransportError {
    return new TransportError(
        message,
        `${error.message}. Install the issuing CA in the system certificate store, or turn off "Verify TLS certificates" in the request settings.`
    );
}

function toTransportError(error: NodeJS.ErrnoException, url: URL): TransportError {
    switch (error.code) {
        case 'ABORT_ERR':
            return new TransportError('Request cancelled.');
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return new TransportError(`Could not resolve host "${url.hostname}".`, error.message);
        case 'ECONNREFUSED':
            return new TransportError(`Connection refused by ${url.host}.`, error.message);
        case 'ECONNRESET':
            return new TransportError('The connection was reset by the server.', error.message);
        case 'ETIMEDOUT':
            return new TransportError(`Connection to ${url.host} timed out.`, error.message);
        case 'CERT_HAS_EXPIRED':
            return new TransportError(
                `The TLS certificate for ${url.host} has expired.`,
                error.message
            );
        case 'ERR_TLS_CERT_ALTNAME_INVALID':
            return new TransportError(
                `The TLS certificate for ${url.host} was issued for a different host.`,
                error.message
            );
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
        case 'SELF_SIGNED_CERT_IN_CHAIN':
            return untrustedCertificate(
                `The TLS certificate for ${url.host} is self-signed.`,
                error
            );
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        case 'UNABLE_TO_GET_ISSUER_CERT':
        case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
            return untrustedCertificate(
                `The TLS certificate chain for ${url.host} could not be verified.`,
                error
            );
        default:
            return new TransportError(error.message || 'The request failed.', error.code);
    }
}

export async function executeRequest(
    wire: WireRequest,
    settings: RequestSettings,
    signal: AbortSignal
): Promise<RawResponse> {
    let url = wire.url;
    let method = wire.method;
    let headers = wire.headers;
    let body = wire.body;
    const redirects: string[] = [];
    const totals: ResponseTimings = {
        dns: 0,
        connect: 0,
        tls: 0,
        wait: 0,
        download: 0,
        total: 0,
    };

    const deadline = Date.now() + settings.timeout;

    for (let hop = 0; ; hop++) {
        const exchange = await performExchange(
            url,
            method,
            headers,
            body,
            settings,
            signal,
            deadline
        );

        totals.dns += exchange.timings.dns;
        totals.connect += exchange.timings.connect;
        totals.tls += exchange.timings.tls;
        totals.wait += exchange.timings.wait;
        totals.download += exchange.timings.download;
        totals.total += exchange.timings.total;
        const location = headerValue(exchange.headers, 'location');
        const isRedirect = REDIRECT_STATUSES.has(exchange.status) && Boolean(location);

        if (!settings.followRedirects || !isRedirect) {
            return {
                capped: exchange.capped,
                status: exchange.status,
                statusText: exchange.statusText,
                httpVersion: exchange.httpVersion,
                headers: exchange.headers,
                body: exchange.body,
                timings: totals,
                redirects,
                finalUrl: url.toString(),
            };
        }

        if (hop >= MAX_REDIRECTS) {
            throw new TransportError(`Too many redirects (stopped after ${MAX_REDIRECTS} hops).`);
        }

        const target = new URL(location as string, url);
        const dropsBody = exchange.status === 303 || (exchange.status < 307 && method === 'POST');

        redirects.push(target.toString());
        headers = headersForRedirect(headers, url, target, !dropsBody);
        if (dropsBody) {
            method = 'GET';
            body = undefined;
        }

        url = target;
    }
}
