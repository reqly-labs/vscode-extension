import { MAX_PREVIEW_BYTES } from '../core/constants';
import type { HttpResponse } from '../core/types';
import type { RawResponse } from './executeRequest';
function headerValue(headers: [string, string][], name: string): string {
    const lower = name.toLowerCase();
    return headers.find(([key]) => key.toLowerCase() === lower)?.[1] ?? '';
}
export function mimeType(contentType: string): string {
    return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}
function charset(contentType: string): string {
    return /charset=["']?([^;"']+)/i.exec(contentType)?.[1]?.trim() || 'utf-8';
}
function decodeText(data: Buffer, contentType: string): string {
    try {
        return new TextDecoder(charset(contentType)).decode(data);
    } catch {
        return data.toString('utf8');
    }
}
function isTextual(mime: string): boolean {
    return (
        mime.startsWith('text/') ||
        mime.endsWith('+json') ||
        mime.endsWith('+xml') ||
        [
            'application/json',
            'application/xml',
            'application/javascript',
            'application/x-www-form-urlencoded',
            'application/graphql',
            'application/ld+json',
            '',
        ].includes(mime)
    );
}
export function decodeResponse(raw: RawResponse): HttpResponse {
    const contentType = headerValue(raw.headers, 'content-type');
    const mime = mimeType(contentType);
    const oversized = raw.body.byteLength > MAX_PREVIEW_BYTES;
    const base = {
        status: raw.status,
        statusText: raw.statusText,
        httpVersion: raw.httpVersion,
        headers: raw.headers,
        size: raw.body.byteLength,
        timings: raw.timings,
        contentType,
        redirects: raw.redirects,
        finalUrl: raw.finalUrl,
    };
    if (oversized) {
        return { ...base, body: '', previewUri: null, binary: false, truncated: true };
    }
    if (mime.startsWith('image/')) {
        return {
            ...base,
            body: raw.body.toString('base64'),
            previewUri: `data:${mime};base64,${raw.body.toString('base64')}`,
            binary: true,
            truncated: false,
        };
    }
    if (!isTextual(mime)) {
        return {
            ...base,
            body: raw.body.toString('base64'),
            previewUri: null,
            binary: true,
            truncated: false,
        };
    }
    return {
        ...base,
        body: decodeText(raw.body, contentType),
        previewUri: null,
        binary: false,
        truncated: false,
    };
}
