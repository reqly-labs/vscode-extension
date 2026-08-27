import type { ActiveRequestInfo, WebviewState } from '../core/messages';
import type { HttpResponse, RequestError, RequestSettings, RequestSnapshot } from '../core/types';
import { createSettings, createSnapshot } from '../core/types';

export interface AppState extends WebviewState {
    loading: boolean;
    response: HttpResponse | null;
    error: RequestError | null;
    requestId: number;
    prettyPrint: boolean;
    wrapLines: boolean;
    active: ActiveRequestInfo;
    baseline: string;
}

export const CHANNELS = [
    'method',
    'url',
    'requestTab',
    'params',
    'headers',
    'body',
    'auth',
    'settings',
    'response',
    'responseTab',
    'active',
] as const;

export type Channel = (typeof CHANNELS)[number];

type Listener = () => void;

const listeners = new Map<Channel, Set<Listener>>();

export const state: AppState = {
    snapshot: createSnapshot(),
    settings: createSettings(),
    activeRequestTab: 'params',
    activeResponseTab: 'body',
    activeRequestId: null,
    loading: false,
    response: null,
    error: null,
    requestId: 0,
    prettyPrint: true,
    wrapLines: true,
    active: { id: null, name: '', location: '' },
    baseline: '',
};

export function fingerprint(): string {
    return JSON.stringify(state.snapshot);
}

function assignActive(info: ActiveRequestInfo | undefined): void {
    state.active = {
        id: info?.id ?? null,
        name: info?.name ?? '',
        location: info?.location ?? '',
    };
    state.activeRequestId = state.active.id;
}

export function setActive(info: ActiveRequestInfo | undefined): void {
    assignActive(info);
    emit('active');
}

export function markSaved(): void {
    state.baseline = fingerprint();
}

export function isDirty(): boolean {
    return state.baseline !== fingerprint();
}

function refill<T>(target: T[], next: readonly T[]): void {
    target.splice(0, target.length, ...next);
}

function applySnapshot(target: RequestSnapshot, next: RequestSnapshot): void {
    target.method = next.method;
    target.url = next.url;
    target.bodyType = next.bodyType;
    target.body = next.body;
    target.binaryPath = next.binaryPath;
    target.auth = next.auth;
    refill(target.params, next.params);
    refill(target.headers, next.headers);
    refill(target.formBody, next.formBody);
    refill(target.multipartBody, next.multipartBody);
}

function applySettings(target: RequestSettings, next: RequestSettings): void {
    Object.assign(target, next);
}

export function hydrate(next: WebviewState, active?: ActiveRequestInfo): void {
    applySnapshot(state.snapshot, { ...createSnapshot(), ...next.snapshot });
    applySettings(state.settings, { ...createSettings(), ...next.settings });
    state.activeRequestTab = next.activeRequestTab || 'params';
    state.activeResponseTab = next.activeResponseTab || 'body';
    assignActive(active ?? { id: next.activeRequestId, name: '', location: '' });
    markSaved();
    emit();
}

export function on(channel: Channel, listener: Listener): void {
    const set = listeners.get(channel) ?? new Set();

    set.add(listener);
    listeners.set(channel, set);
}

export function emit(...channels: Channel[]): void {
    for (const channel of channels.length > 0 ? channels : CHANNELS) {
        listeners.get(channel)?.forEach((listener) => listener());
    }
}

export function persistable(): WebviewState {
    return {
        snapshot: state.snapshot,
        settings: state.settings,
        activeRequestTab: state.activeRequestTab,
        activeResponseTab: state.activeResponseTab,
        activeRequestId: state.activeRequestId,
    };
}
