import { HTTP_METHODS } from './constants';
import { createId, type FormField, type HttpMethod, type RequestSnapshot } from './types';

export interface ParsedCurl {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    data?: string;
    multipartFields?: FormField[];
}

function tokenize(input: string): string[] {
    const normalized = input
        .replace(/\\\r?\n/g, ' ')
        .replace(/\^\r?\n/g, ' ')
        .trim();
    const tokens: string[] = [];

    let current = '';
    let quote: "'" | '"' | null = null;

    for (let i = 0; i < normalized.length; i += 1) {
        const ch = normalized[i];

        if (quote === "'") {
            if (ch === "'") {
                quote = null;
            } else {
                current += ch;
            }
            continue;
        }

        if (quote === '"') {
            if (ch === '"') {
                quote = null;
                continue;
            }

            if (ch === '\\' && i + 1 < normalized.length) {
                const next = normalized[i + 1];

                if (next === '"' || next === '\\') {
                    current += next;
                    i += 1;
                    continue;
                }
            }

            current += ch;
            continue;
        }

        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }

        if (/\s/.test(ch)) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        if (ch === '\\' && i + 1 < normalized.length) {
            current += normalized[i + 1];
            i += 1;
            continue;
        }

        current += ch;
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

function normalizeMethod(method: string): HttpMethod {
    const upper = method.toUpperCase();
    return HTTP_METHODS.includes(upper as HttpMethod) ? (upper as HttpMethod) : 'GET';
}

function parseHeader(raw: string): { key: string; value: string } | null {
    const index = raw.indexOf(':');

    if (index <= 0) {
        return null;
    }

    return { key: raw.slice(0, index).trim(), value: raw.slice(index + 1).trim() };
}

/** Recognises a pasted `curl` invocation and lifts it into request fields. */
export function parseCurlCommand(input: string): ParsedCurl | null {
    const trimmed = input.trim();

    if (!/^curl[\s\n]/i.test(trimmed)) {
        return null;
    }

    const tokens = tokenize(trimmed);

    if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
        return null;
    }

    let method = '';
    let url = '';
    const headers: Record<string, string> = {};
    const dataParts: string[] = [];
    const formParts: string[] = [];

    const take = (index: number): string | null => tokens[index + 1] ?? null;

    for (let i = 1; i < tokens.length; i += 1) {
        const token = tokens[i];

        if (token === '-X' || token === '--request') {
            const value = take(i);
            if (value) {
                method = value;
                i += 1;
            }
            continue;
        }

        if (token.startsWith('-X') && token.length > 2) {
            method = token.slice(2);
            continue;
        }

        if (token.startsWith('--request=')) {
            method = token.slice('--request='.length);
            continue;
        }

        if (token === '-H' || token === '--header') {
            const value = take(i);
            if (value) {
                const header = parseHeader(value);
                if (header) {
                    headers[header.key] = header.value;
                }
                i += 1;
            }
            continue;
        }

        if (token.startsWith('-H') && token.length > 2) {
            const header = parseHeader(token.slice(2));
            if (header) {
                headers[header.key] = header.value;
            }
            continue;
        }

        if (token === '-u' || token === '--user') {
            const value = take(i);
            if (value) {
                headers['Authorization'] = `Basic ${toBase64(value)}`;
                i += 1;
            }
            continue;
        }

        if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(token)) {
            const value = take(i);
            if (value !== null) {
                dataParts.push(value);
                i += 1;
            }
            continue;
        }

        if (token.startsWith('--data') && token.includes('=')) {
            dataParts.push(token.slice(token.indexOf('=') + 1));
            continue;
        }

        if (token.startsWith('-d') && token.length > 2) {
            dataParts.push(token.slice(2));
            continue;
        }

        if (token === '--url') {
            const value = take(i);
            if (value) {
                url = value;
                i += 1;
            }
            continue;
        }

        if (token.startsWith('--url=')) {
            url = token.slice('--url='.length);
            continue;
        }

        if (token === '-F' || token === '--form') {
            const value = take(i);
            if (value !== null) {
                formParts.push(value);
                i += 1;
            }
            continue;
        }

        if (token.startsWith('-F') && token.length > 2) {
            formParts.push(token.slice(2));
            continue;
        }

        if (token.startsWith('--form=')) {
            formParts.push(token.slice('--form='.length));
            continue;
        }

        if (!token.startsWith('-') && !url) {
            url = token;
        }
    }

    if (!url) {
        return null;
    }

    if (!method) {
        method = dataParts.length > 0 || formParts.length > 0 ? 'POST' : 'GET';
    }

    if (formParts.length > 0) {
        return {
            method: normalizeMethod(method),
            url,
            headers,
            multipartFields: formParts.map((part) => {
                const index = part.indexOf('=');

                if (index <= 0) {
                    return { id: createId(), key: part, value: '', type: 'text', enabled: true };
                }

                const raw = part.slice(index + 1);
                const isFile = raw.startsWith('@');

                return {
                    id: createId(),
                    key: part.slice(0, index),
                    value: isFile ? '' : raw,
                    filePath: isFile ? raw.slice(1) : undefined,
                    type: isFile ? 'file' : 'text',
                    enabled: true,
                };
            }),
        };
    }

    return {
        method: normalizeMethod(method),
        url,
        headers,
        data: dataParts.length > 0 ? dataParts.join('&') : undefined,
    };
}

function toBase64(value: string): string {
    if (typeof btoa === 'function') {
        return btoa(value);
    }

    return Buffer.from(value, 'utf8').toString('base64');
}

function shellEscape(value: string): string {
    if (/^[a-zA-Z0-9._\-/:@=&?%+~#]+$/.test(value)) {
        return value;
    }

    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Renders the current request as a copy-pasteable `curl` command. */
export function buildCurlCommand(snapshot: RequestSnapshot): string {
    // Each entry becomes one continued shell line, so flags stay next to their
    // values instead of being split across the line breaks.
    const lines: string[] = [];
    const head = snapshot.method === 'GET' ? ['curl'] : ['curl', '-X', snapshot.method];

    const url = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(snapshot.url.trim())
            ? snapshot.url.trim()
            : `https://${snapshot.url.trim()}`
    );

    snapshot.params
        .filter((param) => param.enabled && param.key)
        .forEach((param) => url.searchParams.append(param.key, param.value));

    const { auth } = snapshot;

    if (auth.type === 'api-key' && auth.addTo === 'query' && auth.key) {
        url.searchParams.append(auth.key, auth.value);
    }

    head.push(shellEscape(url.toString()));
    lines.push(head.join(' '));

    const headers: { key: string; value: string }[] = snapshot.headers
        .filter((header) => header.enabled && header.key)
        .map((header) => ({ key: header.key, value: header.value }));

    const hasHeader = (name: string) => headers.some((header) => header.key.toLowerCase() === name);

    if (auth.type === 'bearer' && auth.token) {
        headers.push({
            key: 'Authorization',
            value: `${auth.prefix || 'Bearer'} ${auth.token}`,
        });
    } else if (auth.type === 'basic' && (auth.username || auth.password)) {
        headers.push({
            key: 'Authorization',
            value: `Basic ${toBase64(`${auth.username}:${auth.password}`)}`,
        });
    } else if (auth.type === 'api-key' && auth.addTo === 'header' && auth.key) {
        headers.push({ key: auth.key, value: auth.value });
    }

    let data: string | undefined;
    const sendsBody = snapshot.method !== 'GET' && snapshot.method !== 'HEAD';

    if (sendsBody && (snapshot.bodyType === 'json' || snapshot.bodyType === 'xml')) {
        data = snapshot.body;

        if (!hasHeader('content-type')) {
            headers.push({
                key: 'Content-Type',
                value: snapshot.bodyType === 'json' ? 'application/json' : 'application/xml',
            });
        }
    } else if (sendsBody && snapshot.bodyType === 'text') {
        data = snapshot.body;

        if (!hasHeader('content-type')) {
            headers.push({ key: 'Content-Type', value: 'text/plain' });
        }
    } else if (sendsBody && snapshot.bodyType === 'form') {
        const search = new URLSearchParams();
        snapshot.formBody
            .filter((field) => field.enabled && field.key)
            .forEach((field) => search.append(field.key, field.value));
        data = search.toString();

        if (!hasHeader('content-type')) {
            headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
        }
    }

    headers.forEach((header) => lines.push(`-H ${shellEscape(`${header.key}: ${header.value}`)}`));

    if (data) {
        lines.push(`--data-raw ${shellEscape(data)}`);
    }

    if (sendsBody && snapshot.bodyType === 'multipart') {
        snapshot.multipartBody
            .filter((field) => field.enabled && field.key)
            .forEach((field) => {
                const value =
                    field.type === 'file' ? `@${field.filePath || 'path/to/file'}` : field.value;
                lines.push(`-F ${shellEscape(`${field.key}=${value}`)}`);
            });
    }

    if (sendsBody && snapshot.bodyType === 'binary' && snapshot.binaryPath) {
        lines.push(`--data-binary ${shellEscape(`@${snapshot.binaryPath}`)}`);
    }

    return lines.join(' \\\n  ');
}
