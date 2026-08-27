import { AUTH_TYPES, BODY_TYPES, DEFAULT_TIMEOUT_MS, HTTP_METHODS } from './constants';

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type BodyType = (typeof BODY_TYPES)[number];

export type AuthType = (typeof AUTH_TYPES)[number];

export interface KeyValue {
    id: string;
    key: string;
    value: string;
    enabled: boolean;
}

export interface FormField extends KeyValue {
    type: 'text' | 'file';
    filePath?: string;
}

export interface AuthNone {
    type: 'none';
}

export interface AuthBearer {
    type: 'bearer';
    token: string;
    prefix: string;
}

export interface AuthBasic {
    type: 'basic';
    username: string;
    password: string;
}

export interface AuthApiKey {
    type: 'api-key';
    key: string;
    value: string;
    addTo: 'header' | 'query';
}

export type Auth = AuthNone | AuthBearer | AuthBasic | AuthApiKey;

export interface RequestSnapshot {
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    bodyType: BodyType;
    body: string;
    formBody: KeyValue[];
    multipartBody: FormField[];
    binaryPath: string;
    auth: Auth;
}

export interface RequestSettings {
    timeout: number;
    followRedirects: boolean;
    rejectUnauthorized: boolean;
}

export interface ResponseTimings {
    dns: number;
    connect: number;
    tls: number;
    wait: number;
    download: number;
    total: number;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: [string, string][];
    size: number;
    timings: ResponseTimings;
    contentType: string;
    body: string;
    previewUri: string | null;
    binary: boolean;
    truncated: boolean;
    redirects: string[];
    finalUrl: string;
}

export interface RequestError {
    message: string;
    detail?: string;
}

export function createId(): string {
    return Math.random().toString(36).slice(2, 10);
}

export function emptyKeyValue(): KeyValue {
    return { id: createId(), key: '', value: '', enabled: true };
}

export function emptyFormField(): FormField {
    return { id: createId(), key: '', value: '', enabled: true, type: 'text' };
}

export function createSnapshot(): RequestSnapshot {
    return {
        method: 'GET',
        url: '',
        params: [emptyKeyValue()],
        headers: [emptyKeyValue()],
        bodyType: 'none',
        body: '',
        formBody: [emptyKeyValue()],
        multipartBody: [emptyFormField()],
        binaryPath: '',
        auth: { type: 'none' },
    };
}

export function createSettings(): RequestSettings {
    return {
        timeout: DEFAULT_TIMEOUT_MS,
        followRedirects: true,
        rejectUnauthorized: true,
    };
}
