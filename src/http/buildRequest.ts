import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { HttpMethod, KeyValue, RequestSnapshot } from '../core/types';

export interface WireRequest {
    url: URL;
    method: HttpMethod;
    headers: Record<string, string>;
    body?: Buffer;
}

export class BuildError extends Error {}

function enabled(items: KeyValue[]): KeyValue[] {
    return items.filter((item) => item.enabled && item.key.trim().length > 0);
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
    const lower = name.toLowerCase();
    return Object.keys(headers).find((key) => key.toLowerCase() === lower);
}

function setDefaultHeader(headers: Record<string, string>, name: string, value: string): void {
    if (!findHeader(headers, name)) {
        headers[name] = value;
    }
}

function normalizeUrl(raw: string): URL {
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new BuildError('Enter a URL before sending the request.');
    }

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const url = new URL(withScheme);

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new BuildError(`Unsupported protocol "${url.protocol}". Use http or https.`);
        }

        return url;
    } catch (error) {
        if (error instanceof BuildError) {
            throw error;
        }

        throw new BuildError(`"${trimmed}" is not a valid URL.`);
    }
}

function encodeMultipart(
    fields: { name: string; value: string; filePath?: string; content?: Buffer }[]
): { body: Buffer; contentType: string } {
    const boundary = `----ReqlyFormBoundary${randomBytes(12).toString('hex')}`;
    const chunks: Buffer[] = [];

    for (const field of fields) {
        const disposition = field.filePath
            ? `form-data; name="${field.name}"; filename="${basename(field.filePath)}"`
            : `form-data; name="${field.name}"`;

        const head = field.content
            ? `--${boundary}\r\nContent-Disposition: ${disposition}\r\nContent-Type: application/octet-stream\r\n\r\n`
            : `--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`;

        chunks.push(Buffer.from(head, 'utf8'));
        chunks.push(field.content ?? Buffer.from(field.value, 'utf8'));
        chunks.push(Buffer.from('\r\n', 'utf8'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

    return {
        body: Buffer.concat(chunks),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

async function readBinary(path: string): Promise<Buffer> {
    try {
        return await readFile(path);
    } catch {
        throw new BuildError(`Could not read file "${path}".`);
    }
}

export async function buildRequest(snapshot: RequestSnapshot): Promise<WireRequest> {
    const url = normalizeUrl(snapshot.url);
    const headers: Record<string, string> = {};

    for (const header of enabled(snapshot.headers)) {
        headers[header.key.trim()] = header.value;
    }

    for (const param of enabled(snapshot.params)) {
        url.searchParams.append(param.key.trim(), param.value);
    }

    const { auth } = snapshot;

    if (auth.type === 'bearer' && auth.token.trim()) {
        const prefix = auth.prefix.trim() || 'Bearer';
        headers['Authorization'] = `${prefix} ${auth.token.trim()}`;
    } else if (auth.type === 'basic' && (auth.username || auth.password)) {
        const encoded = Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
    } else if (auth.type === 'api-key' && auth.key.trim()) {
        if (auth.addTo === 'header') {
            headers[auth.key.trim()] = auth.value;
        } else {
            url.searchParams.append(auth.key.trim(), auth.value);
        }
    }

    const body = await buildBody(snapshot, headers);

    if (body) {
        headers['Content-Length'] = String(body.byteLength);
    }

    setDefaultHeader(headers, 'Accept', '*/*');
    setDefaultHeader(headers, 'Accept-Encoding', 'gzip, deflate, br');
    setDefaultHeader(headers, 'User-Agent', 'Reqly/VSCode');

    return { url, method: snapshot.method, headers, body };
}

async function buildBody(
    snapshot: RequestSnapshot,
    headers: Record<string, string>
): Promise<Buffer | undefined> {
    const { bodyType, method } = snapshot;

    if (bodyType === 'none' || method === 'GET' || method === 'HEAD') {
        return undefined;
    }

    if (bodyType === 'json' || bodyType === 'xml' || bodyType === 'text') {
        if (!snapshot.body) {
            return undefined;
        }

        const mediaType =
            bodyType === 'json'
                ? 'application/json'
                : bodyType === 'xml'
                  ? 'application/xml'
                  : 'text/plain';

        setDefaultHeader(headers, 'Content-Type', `${mediaType}; charset=utf-8`);

        return Buffer.from(snapshot.body, 'utf8');
    }

    if (bodyType === 'form') {
        const search = new URLSearchParams();
        enabled(snapshot.formBody).forEach((field) => search.append(field.key.trim(), field.value));

        setDefaultHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded');

        return Buffer.from(search.toString(), 'utf8');
    }

    if (bodyType === 'multipart') {
        const fields = await Promise.all(
            snapshot.multipartBody
                .filter((field) => field.enabled && field.key.trim())
                .map(async (field) => ({
                    name: field.key.trim(),
                    value: field.value,
                    filePath: field.type === 'file' ? field.filePath : undefined,
                    content:
                        field.type === 'file' && field.filePath
                            ? await readBinary(field.filePath)
                            : undefined,
                }))
        );

        if (fields.length === 0) {
            return undefined;
        }

        const { body, contentType } = encodeMultipart(fields);
        headers[findHeader(headers, 'Content-Type') ?? 'Content-Type'] = contentType;

        return body;
    }

    if (bodyType === 'binary') {
        if (!snapshot.binaryPath) {
            throw new BuildError('Select a file to send as the request body.');
        }

        setDefaultHeader(headers, 'Content-Type', 'application/octet-stream');

        return readBinary(snapshot.binaryPath);
    }

    return undefined;
}
