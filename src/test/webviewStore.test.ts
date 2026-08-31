import * as assert from 'node:assert/strict';
import type { WebviewState } from '../core/messages';
import { createSettings, createSnapshot, type RequestSnapshot } from '../core/types';
import {
    getState,
    hydrate,
    isDirty,
    mutate,
    persistable,
    setActive,
    watch,
} from '../webview/store';
import { webviewState } from './webviewHarness';

function loadRequest(snapshot: Partial<RequestSnapshot>, id: string | null = null): void {
    hydrate(webviewState(snapshot, id), { id, name: '', location: '' });
}

suite('webview store', () => {
    const disposals: (() => void)[] = [];

    function track<T>(select: (state: ReturnType<typeof getState>) => T): {
        values: T[];
        calls: number;
    } {
        const record: { values: T[]; calls: number } = { values: [], calls: 0 };

        disposals.push(
            watch(select, (value) => {
                record.values.push(value);
                record.calls += 1;
            })
        );

        return record;
    }

    setup(() => {
        loadRequest({});
        setActive({ id: null, name: '', location: '' });
    });

    teardown(() => {
        disposals.splice(0).forEach((dispose) => dispose());
    });

    test('keeps the snapshot object identity across hydrations', () => {
        const first = persistable().snapshot;

        loadRequest({ url: 'https://api.example.com/one' }, 'req-1');
        loadRequest({ url: 'https://api.example.com/two' }, 'req-2');
        assert.equal(persistable().snapshot, first, 'hydrate must not swap the snapshot object');
        assert.equal(first.url, 'https://api.example.com/two');
    });

    test('keeps collection identities and replaces their contents', () => {
        const { params, headers, formBody, multipartBody } = persistable().snapshot;

        loadRequest({
            params: [{ id: 'p1', key: 'q', value: 'ducks', enabled: true }],
            headers: [],
            formBody: [{ id: 'f1', key: 'name', value: 'Ada', enabled: true }],
            multipartBody: [{ id: 'm1', key: 'file', value: '', enabled: true, type: 'file' }],
        });

        const snapshot = persistable().snapshot;

        assert.equal(snapshot.params, params);
        assert.equal(snapshot.headers, headers);
        assert.equal(snapshot.formBody, formBody);
        assert.equal(snapshot.multipartBody, multipartBody);
        assert.deepEqual(
            params.map((item) => item.key),
            ['q']
        );
        assert.equal(headers.length, 0);
        assert.equal(multipartBody[0].type, 'file');
    });

    test('fills defaults for a payload that omits fields', () => {
        loadRequest({ url: 'https://api.example.com', method: 'POST' });
        const partial = {
            ...webviewState({}),
            snapshot: { url: 'https://api.example.com/next' } as RequestSnapshot,
        } satisfies WebviewState;

        hydrate(partial);
        assert.equal(getState().snapshot.method, 'GET');
        assert.equal(getState().snapshot.bodyType, 'none');
        assert.equal(getState().snapshot.params.length, 1);
        assert.equal(getState().snapshot.url, 'https://api.example.com/next');
    });

    test('keeps activeRequestId in sync with the active request', () => {
        loadRequest({ url: 'https://api.example.com' }, 'req-1');
        assert.equal(getState().activeRequestId, 'req-1');
        setActive({ id: 'req-9', name: 'Listar', location: 'Catálogo' });
        assert.equal(getState().activeRequestId, 'req-9');
        assert.equal(persistable().activeRequestId, 'req-9');
        setActive(undefined);
        assert.equal(getState().activeRequestId, null);
    });

    test('persists the values edited after the last hydration', () => {
        loadRequest({}, 'req-1');
        mutate((draft) => {
            draft.snapshot.url = 'http://localhost:5208/apartamentos';
        });
        assert.equal(persistable().snapshot.url, 'http://localhost:5208/apartamentos');
        assert.equal(persistable().activeRequestId, 'req-1');
    });

    test('carries every settings field across a hydration', () => {
        const settings = createSettings();
        const custom = Object.fromEntries(
            Object.entries(settings).map(([key, value]) => [
                key,
                typeof value === 'number' ? value + 1 : !value,
            ])
        ) as unknown as typeof settings;

        hydrate({ ...webviewState({}), settings: custom });

        for (const key of Object.keys(settings)) {
            assert.deepEqual(
                getState().settings[key as keyof typeof settings],
                custom[key as keyof typeof settings],
                `hydrate dropped the "${key}" setting`
            );
        }
    });

    test('carries every snapshot field across a hydration', () => {
        const snapshot: RequestSnapshot = {
            ...createSnapshot(),
            method: 'PATCH',
            url: 'https://api.example.com/one',
            bodyType: 'json',
            body: '{"a":1}',
            binaryPath: 'C:/tmp/file.bin',
            auth: { type: 'bearer', token: 'abc', prefix: 'Token' },
        };

        hydrate({ ...webviewState({}), snapshot });

        assert.deepEqual(persistable().snapshot, snapshot);
    });

    test('gives a watcher the current value the moment it subscribes', () => {
        loadRequest({ url: 'https://api.example.com/one' }, 'req-1');

        const url = track((state) => state.snapshot.url);

        assert.deepEqual(url.values, ['https://api.example.com/one']);
    });

    test('reaches every watcher whose slice changed when a request is loaded', () => {
        const params = [{ id: 'p1', key: '', value: '', enabled: true }];

        loadRequest({ params });
        const url = track((state) => state.snapshot.url);
        const method = track((state) => state.snapshot.method);
        const untouched = track((state) => state.snapshot.params);
        const active = track((state) => state.active.id);

        loadRequest({ url: 'https://api.example.com/one', method: 'POST', params }, 'req-1');

        assert.deepEqual(url.values.at(-1), 'https://api.example.com/one');
        assert.deepEqual(method.values.at(-1), 'POST');
        assert.equal(active.values.at(-1), 'req-1');
        assert.equal(untouched.calls, 1, 'an unchanged slice must not repaint');
    });

    test('sees a change made in place inside a collection', () => {
        loadRequest({ params: [{ id: 'p1', key: 'q', value: 'ducks', enabled: true }] });

        const params = track((state) => state.snapshot.params);

        mutate((draft) => {
            draft.snapshot.params[0].value = 'geese';
        });

        assert.equal(params.calls, 2);
        assert.equal(params.values.at(-1)?.[0].value, 'geese');
    });

    test('leaves a watcher alone when its slice is untouched', () => {
        const method = track((state) => state.snapshot.method);

        mutate((draft) => {
            draft.snapshot.url = 'https://api.example.com/changed';
        });

        assert.equal(method.calls, 1, 'only the initial call was expected');
    });

    test('hands the watcher a value that later mutations cannot rewrite', () => {
        loadRequest({ params: [{ id: 'p1', key: 'q', value: 'ducks', enabled: true }] });

        const params = track((state) => state.snapshot.params);
        const seen = params.values.at(-1);

        mutate((draft) => {
            draft.snapshot.params[0].value = 'geese';
        });

        assert.equal(seen?.[0].value, 'ducks');
    });

    test('stops calling a watcher once it is released', () => {
        const url = track((state) => state.snapshot.url);

        disposals.splice(0).forEach((dispose) => dispose());
        mutate((draft) => {
            draft.snapshot.url = 'https://api.example.com/after';
        });

        assert.equal(url.calls, 1);
    });

    test('takes the active request from the info it was handed', () => {
        hydrate(webviewState({}, 'stale-id'), { id: 'req-7', name: 'Listar', location: 'Cat' });

        assert.equal(getState().activeRequestId, 'req-7');
        assert.equal(getState().active.name, 'Listar');
        assert.equal(persistable().activeRequestId, 'req-7');
    });

    test('resets the dirty baseline on hydrate', () => {
        loadRequest({ url: 'https://api.example.com' }, 'req-1');
        assert.equal(isDirty(), false);
        mutate((draft) => {
            draft.snapshot.url = 'https://api.example.com/edited';
        });
        assert.equal(isDirty(), true);
        loadRequest({ url: 'https://api.example.com/other' }, 'req-2');
        assert.equal(isDirty(), false);
    });

    test('tells a watcher the request became dirty', () => {
        loadRequest({ url: 'https://api.example.com' }, 'req-1');

        const dirty = track((state) => state.baseline !== JSON.stringify(state.snapshot));

        mutate((draft) => {
            draft.snapshot.url = 'https://api.example.com/edited';
        });

        assert.deepEqual(dirty.values, [false, true]);
    });
});
