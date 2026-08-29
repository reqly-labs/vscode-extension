import { isDynamicVariable, resolveDynamicVariable } from './dynamicVariables';
import { createId, type FormField, type KeyValue, type RequestSnapshot } from './types';

export const MAX_INTERPOLATION_DEPTH = 8;

const TOKEN = /\{\{[^{}]*\}\}/g;

export interface Variable {
    id: string;
    key: string;
    value: string;
    enabled: boolean;
    secret: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: Variable[];
    createdAt: number;
    updatedAt: number;
}

export interface VariableToken {
    start: number;
    end: number;
    text: string;
    name: string;
}

export interface ActiveVariableToken {
    start: number;
    query: string;
}

export function emptyVariable(): Variable {
    return { id: createId(), key: '', value: '', enabled: true, secret: false };
}

export function createEnvironment(name: string): Environment {
    const now = Date.now();

    return {
        id: createId(),
        name: name.trim() || 'New Environment',
        variables: [emptyVariable()],
        createdAt: now,
        updatedAt: now,
    };
}

export function findVariableTokens(text: string): VariableToken[] {
    const tokens: VariableToken[] = [];

    for (const match of text.matchAll(TOKEN)) {
        const start = match.index ?? 0;

        tokens.push({
            start,
            end: start + match[0].length,
            text: match[0],
            name: match[0].slice(2, -2).trim(),
        });
    }

    return tokens;
}

export function findActiveVariableToken(text: string, caret: number): ActiveVariableToken | null {
    const upToCaret = text.slice(0, Math.max(0, Math.min(caret, text.length)));
    const start = upToCaret.lastIndexOf('{{');

    if (start === -1) {
        return null;
    }

    const between = upToCaret.slice(start + 2);

    if (between.includes('{') || between.includes('}') || between.includes('\n')) {
        return null;
    }

    return { start, query: between };
}

export function completeVariableToken(
    text: string,
    token: ActiveVariableToken,
    key: string
): { text: string; caret: number } {
    const before = text.slice(0, token.start);
    const after = text.slice(token.start + 2 + token.query.length);
    const closing = after.startsWith('}}') ? after.slice(2) : after;
    const inserted = `{{${key}}}`;

    return { text: `${before}${inserted}${closing}`, caret: before.length + inserted.length };
}

export function matchVariables(variables: readonly Variable[], query: string): Variable[] {
    const needle = query.trim().toLowerCase();
    const usable = variables.filter((variable) => variable.enabled && variable.key.trim());

    return usable
        .filter((variable) => variable.key.toLowerCase().includes(needle))
        .sort((a, b) => {
            const aStarts = a.key.toLowerCase().startsWith(needle);
            const bStarts = b.key.toLowerCase().startsWith(needle);

            if (aStarts !== bStarts) {
                return aStarts ? -1 : 1;
            }

            return a.key.localeCompare(b.key);
        })
        .slice(0, 50);
}

export function variableValues(environment: Environment | undefined): Record<string, string> {
    const values: Record<string, string> = {};

    for (const variable of environment?.variables ?? []) {
        const key = variable.key.trim();

        if (variable.enabled && key) {
            values[key] = variable.value;
        }
    }

    return values;
}

export interface InterpolateOptions {
    dynamic?: boolean;
}

export function interpolate(
    text: string,
    values: Record<string, string>,
    options: InterpolateOptions = {}
): string {
    if (!text.includes('{{')) {
        return text;
    }

    let current = text;

    for (let pass = 0; pass < MAX_INTERPOLATION_DEPTH; pass += 1) {
        let replaced = false;
        const next = current.replace(TOKEN, (token) => {
            const name = token.slice(2, -2).trim();
            const value =
                options.dynamic && isDynamicVariable(name)
                    ? resolveDynamicVariable(name)
                    : values[name];

            if (value === undefined || value === token) {
                return token;
            }

            replaced = true;

            return value;
        });

        if (!replaced) {
            return next;
        }

        current = next;
    }

    return current;
}

export function unresolvedVariables(text: string, values: Record<string, string>): string[] {
    return findVariableTokens(text)
        .map((token) => token.name)
        .filter((name) => name.length > 0 && !isDynamicVariable(name))
        .filter((name) => interpolate(`{{${name}}}`, values) === `{{${name}}}`);
}

function interpolatePairs<T extends KeyValue>(
    items: T[],
    values: Record<string, string>,
    options: InterpolateOptions
): T[] {
    return items.map((item) => ({
        ...item,
        key: interpolate(item.key, values, options),
        value: interpolate(item.value, values, options),
    }));
}

function interpolateFields(
    items: FormField[],
    values: Record<string, string>,
    options: InterpolateOptions
): FormField[] {
    return items.map((item) => ({
        ...item,
        key: interpolate(item.key, values, options),
        value: item.type === 'file' ? item.value : interpolate(item.value, values, options),
        filePath: item.filePath ? interpolate(item.filePath, values, options) : item.filePath,
    }));
}

export function interpolateSnapshot(
    snapshot: RequestSnapshot,
    values: Record<string, string>,
    options: InterpolateOptions = { dynamic: true }
): RequestSnapshot {
    return {
        ...snapshot,
        url: interpolate(snapshot.url, values, options),
        body: interpolate(snapshot.body, values, options),
        binaryPath: interpolate(snapshot.binaryPath, values, options),
        params: interpolatePairs(snapshot.params, values, options),
        headers: interpolatePairs(snapshot.headers, values, options),
        formBody: interpolatePairs(snapshot.formBody, values, options),
        multipartBody: interpolateFields(snapshot.multipartBody, values, options),
        auth: interpolateAuth(snapshot.auth, values, options),
    };
}

function interpolateAuth(
    auth: RequestSnapshot['auth'],
    values: Record<string, string>,
    options: InterpolateOptions
): RequestSnapshot['auth'] {
    switch (auth.type) {
        case 'bearer':
            return {
                ...auth,
                token: interpolate(auth.token, values, options),
                prefix: interpolate(auth.prefix, values, options),
            };
        case 'basic':
            return {
                ...auth,
                username: interpolate(auth.username, values, options),
                password: interpolate(auth.password, values, options),
            };
        case 'api-key':
            return {
                ...auth,
                key: interpolate(auth.key, values, options),
                value: interpolate(auth.value, values, options),
            };
        default:
            return auth;
    }
}

export function unresolvedInSnapshot(
    snapshot: RequestSnapshot,
    values: Record<string, string>
): string[] {
    const enabled = <T extends KeyValue>(items: T[]) => items.filter((item) => item.enabled);
    const sources = [
        snapshot.url,
        snapshot.body,
        snapshot.binaryPath,
        ...enabled(snapshot.params).flatMap((item) => [item.key, item.value]),
        ...enabled(snapshot.headers).flatMap((item) => [item.key, item.value]),
        ...enabled(snapshot.formBody).flatMap((item) => [item.key, item.value]),
        ...enabled(snapshot.multipartBody).flatMap((item) => [item.key, item.value]),
        ...authStrings(snapshot.auth),
    ];

    return [...new Set(sources.flatMap((source) => unresolvedVariables(source, values)))].sort();
}

function authStrings(auth: RequestSnapshot['auth']): string[] {
    switch (auth.type) {
        case 'bearer':
            return [auth.token, auth.prefix];
        case 'basic':
            return [auth.username, auth.password];
        case 'api-key':
            return [auth.key, auth.value];
        default:
            return [];
    }
}
