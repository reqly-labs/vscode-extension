import type { ActiveRequestInfo, EnvironmentInfo, WebviewState } from '../core/messages';
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
    environment: EnvironmentInfo;
    baseline: string;
}

export type Immutable<T> = T extends (infer Item)[]
    ? readonly Immutable<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: Immutable<T[Key]> }
      : T;

export type ReadonlyAppState = Immutable<AppState>;

export type Selector<T> = (state: ReadonlyAppState) => T;

export type Unwatch = () => void;

interface Watcher {
    select: Selector<unknown>;
    apply: (value: never) => void;
    last: unknown;
}

const watchers = new Set<Watcher>();

const current: AppState = {
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
    environment: { activeId: null, environments: [], collection: null, dynamic: [] },
    baseline: '',
};

let notifying = false;

let repeat = false;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function capture<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(capture) as T;
    }

    if (isPlainObject(value)) {
        const copy: Record<string, unknown> = {};

        for (const key of Object.keys(value)) {
            copy[key] = capture(value[key]);
        }

        return copy as T;
    }

    return value;
}

function same(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
        return true;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => same(item, b[index]));
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);

        return keys.length === Object.keys(b).length && keys.every((key) => same(a[key], b[key]));
    }

    return false;
}

export function getState(): ReadonlyAppState {
    return current as ReadonlyAppState;
}

export function commit(): void {
    if (notifying) {
        repeat = true;

        return;
    }

    notifying = true;
    try {
        do {
            repeat = false;

            for (const watcher of [...watchers]) {
                if (!watchers.has(watcher)) {
                    continue;
                }

                const next = watcher.select(current as ReadonlyAppState);

                if (same(next, watcher.last)) {
                    continue;
                }

                watcher.last = capture(next);
                (watcher.apply as (value: unknown) => void)(watcher.last);
            }
        } while (repeat);
    } finally {
        notifying = false;
    }
}

export function mutate<T>(change: (draft: AppState) => T): T {
    const result = change(current);

    commit();

    return result;
}

export function watch<T>(select: Selector<T>, apply: (value: T) => void): Unwatch {
    const watcher: Watcher = {
        select: select as Selector<unknown>,
        apply: apply as (value: never) => void,
        last: capture(select(current as ReadonlyAppState)),
    };

    watchers.add(watcher);
    apply(watcher.last as T);

    return () => {
        watchers.delete(watcher);
    };
}

export function fingerprint(state: ReadonlyAppState = getState()): string {
    return JSON.stringify(state.snapshot);
}

export function selectDirty(state: ReadonlyAppState): boolean {
    return state.baseline !== fingerprint(state);
}

function assignActive(draft: AppState, info: ActiveRequestInfo | undefined): void {
    draft.active = {
        id: info?.id ?? null,
        name: info?.name ?? '',
        location: info?.location ?? '',
    };
    draft.activeRequestId = draft.active.id;
}

export function setActive(info: ActiveRequestInfo | undefined): void {
    mutate((draft) => assignActive(draft, info));
}

export function setEnvironment(info: EnvironmentInfo): void {
    mutate((draft) => {
        draft.environment = info;
    });
}

export function markSaved(): void {
    mutate((draft) => {
        draft.baseline = JSON.stringify(draft.snapshot);
    });
}

export function isDirty(): boolean {
    return selectDirty(getState());
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
    mutate((draft) => {
        applySnapshot(draft.snapshot, { ...createSnapshot(), ...next.snapshot });
        applySettings(draft.settings, { ...createSettings(), ...next.settings });
        draft.activeRequestTab = next.activeRequestTab || 'params';
        draft.activeResponseTab = next.activeResponseTab || 'body';
        assignActive(draft, active ?? { id: next.activeRequestId, name: '', location: '' });
        draft.baseline = JSON.stringify(draft.snapshot);
    });
}

export function persistable(): WebviewState {
    return {
        snapshot: current.snapshot,
        settings: current.settings,
        activeRequestTab: current.activeRequestTab,
        activeResponseTab: current.activeResponseTab,
        activeRequestId: current.activeRequestId,
    };
}
