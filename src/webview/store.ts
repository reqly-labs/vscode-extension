import type { ActiveRequestInfo, WebviewState } from '../core/messages';
import { createSettings, createSnapshot } from '../core/types';
import type { HttpResponse, RequestError } from '../core/types';
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
export type Channel =
    | 'method'
    | 'url'
    | 'requestTab'
    | 'params'
    | 'headers'
    | 'body'
    | 'auth'
    | 'settings'
    | 'response'
    | 'responseTab'
    | 'active';
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
export function setActive(info: ActiveRequestInfo | undefined): void {
    state.active = {
        id: info?.id ?? null,
        name: info?.name ?? '',
        location: info?.location ?? '',
    };
}
export function markSaved(): void {
    state.baseline = fingerprint();
}
export function isDirty(): boolean {
    return state.baseline !== fingerprint();
}
export function hydrate(next: WebviewState): void {
    state.snapshot = { ...createSnapshot(), ...next.snapshot };
    state.settings = { ...createSettings(), ...next.settings };
    state.activeRequestTab = next.activeRequestTab || 'params';
    state.activeResponseTab = next.activeResponseTab || 'body';
    state.activeRequestId = next.activeRequestId ?? null;
    markSaved();
}
export function on(channel: Channel, listener: Listener): void {
    const set = listeners.get(channel) ?? new Set();
    set.add(listener);
    listeners.set(channel, set);
}
export function emit(...channels: Channel[]): void {
    for (const channel of channels) {
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
