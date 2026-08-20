import { parseCurlCommand } from '../core/curl';
import { createId, emptyFormField, emptyKeyValue, type BodyType } from '../core/types';
import { state } from './store';

function inferBodyType(contentType: string, body: string): BodyType {
    const type = contentType.toLowerCase();

    if (type.includes('json')) {
        return 'json';
    }

    if (type.includes('xml')) {
        return 'xml';
    }

    if (type.includes('x-www-form-urlencoded')) {
        return 'form';
    }

    if (!body.trim()) {
        return 'none';
    }

    try {
        JSON.parse(body);
        return 'json';
    } catch {
        return 'text';
    }
}

function fill<T>(target: T[], next: T[]): void {
    target.splice(0, target.length, ...next);
}

export function applyCurl(text: string): boolean {
    const parsed = parseCurlCommand(text);

    if (!parsed) {
        return false;
    }

    const { snapshot } = state;

    snapshot.method = parsed.method;
    snapshot.url = parsed.url;
    snapshot.auth = { type: 'none' };

    fill(
        snapshot.headers,
        Object.entries(parsed.headers).map(([key, value]) => ({
            id: createId(),
            key,
            value,
            enabled: true,
        }))
    );

    if (snapshot.headers.length === 0) {
        snapshot.headers.push(emptyKeyValue());
    }

    fill(snapshot.params, [emptyKeyValue()]);

    try {
        const url = new URL(parsed.url);

        if (url.search) {
            fill(
                snapshot.params,
                [...url.searchParams].map(([key, value]) => ({
                    id: createId(),
                    key,
                    value,
                    enabled: true,
                }))
            );

            url.search = '';
            snapshot.url = url.toString();
        }
    } catch {}

    if (parsed.multipartFields) {
        snapshot.bodyType = 'multipart';
        snapshot.body = '';
        fill(snapshot.multipartBody, parsed.multipartFields);
        fill(snapshot.formBody, [emptyKeyValue()]);

        if (snapshot.multipartBody.length === 0) {
            snapshot.multipartBody.push(emptyFormField());
        }

        return true;
    }

    const contentType =
        Object.entries(parsed.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ??
        '';

    const body = parsed.data ?? '';
    const bodyType = inferBodyType(contentType, body);

    snapshot.bodyType = bodyType;
    snapshot.body = bodyType === 'form' ? '' : body;
    fill(snapshot.multipartBody, [emptyFormField()]);

    if (bodyType === 'form' && body) {
        const search = new URLSearchParams(body);
        const fields = [...search].map(([key, value]) => ({
            id: createId(),
            key,
            value,
            enabled: true,
        }));

        fill(snapshot.formBody, fields.length > 0 ? fields : [emptyKeyValue()]);
    } else {
        fill(snapshot.formBody, [emptyKeyValue()]);
    }

    return true;
}
