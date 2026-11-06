import * as assert from 'node:assert/strict';
import { mountWebview, webviewState, type WebviewHarness } from './webviewHarness';

type BridgeModule = typeof import('../webview/bridge');

suite('the panel while requests save themselves', () => {
    let harness: WebviewHarness;
    let header: HTMLElement;

    setup(() => {
        harness = mountWebview();
        harness.store.hydrate(webviewState({ url: 'https://api.test.dev/users' }, 'req-1'), {
            id: 'req-1',
            name: 'List users',
            location: 'Users',
        });
        header = harness.createRequestHeader({ onSave: () => {}, onManageEnvironments: () => {} });
        harness.window.document.body.appendChild(header);
    });

    teardown(() => {
        harness.dispose();
    });

    function dotVisible(): boolean {
        return !header.querySelector('.request-dot')?.classList.contains('is-hidden');
    }

    function saveButton(): HTMLElement {
        const button = header.querySelector<HTMLElement>('.request-save');

        assert.ok(button);

        return button;
    }

    function edit(url: string): void {
        harness.store.mutate((draft) => {
            draft.snapshot.url = url;
        });
    }

    test('clears the unsaved mark once the version on screen is the one saved', () => {
        edit('https://api.test.dev/users?page=2');
        assert.equal(dotVisible(), true);

        harness.store.markSaved(structuredClone(harness.store.persistable().snapshot));
        assert.equal(dotVisible(), false);
    });

    test('keeps the unsaved mark when typing went on while an older version was saved', () => {
        edit('https://api.test.dev/users?page=2');
        const written = structuredClone(harness.store.persistable().snapshot);

        edit('https://api.test.dev/users?page=3');
        harness.store.markSaved(written);

        assert.equal(dotVisible(), true);
    });

    test('compares what was saved by content, not by how its keys are ordered', () => {
        const { method, url, ...rest } = structuredClone(harness.store.persistable().snapshot);

        harness.store.markSaved({ ...rest, url, method });
        assert.equal(dotVisible(), false);
    });

    test('does not ask for a save that is about to happen on its own', () => {
        edit('https://api.test.dev/users?page=2');

        assert.equal(saveButton().classList.contains('is-active'), false);
        assert.match(saveButton().title, /saved automatically/);
    });

    test('asks for a save when auto save is off', () => {
        harness.store.setAutoSave(false);
        edit('https://api.test.dev/users?page=2');

        assert.equal(saveButton().classList.contains('is-active'), true);
        assert.equal(saveButton().title, 'Save changes to this request');
    });

    test('sends pending edits at once instead of waiting for the delay', () => {
        const bridge = require('../webview/bridge') as BridgeModule;

        bridge.schedulePersist();
        assert.equal(harness.posted.length, 0);

        bridge.flushPendingPersist();
        assert.equal(harness.posted.at(-1)?.type, 'persist');

        const sent = harness.posted.length;

        bridge.flushPendingPersist();
        assert.equal(harness.posted.length, sent, 'nothing is sent twice');
    });
});
