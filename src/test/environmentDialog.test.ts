import * as assert from 'node:assert/strict';
import type { PanelMessage } from '../core/messages';
import type { Environment } from '../core/variables';
import { mountWebview, type WebviewHarness } from './webviewHarness';

function environment(id: string, name: string, variables: Environment['variables']): Environment {
    return { id, name, createdAt: 0, updatedAt: 0, variables };
}

const DEV = environment('e1', 'Dev', [
    { id: 'v1', key: 'baseUrl', value: 'https://dev.test', enabled: true, secret: false },
    { id: 'v2', key: 'apiKey', value: 'shh', enabled: true, secret: true },
]);

const PROD = environment('e2', 'Prod', []);

suite('managing environments inside the panel', () => {
    let harness: WebviewHarness;
    let dialog: { root: HTMLElement; open(): void };

    setup(() => {
        harness = mountWebview();
        harness.store.setEnvironment({
            activeId: 'e1',
            environments: [DEV, PROD],
            collection: null,
            dynamic: [],
        });
        dialog = harness.createEnvironmentDialog();
        harness.window.document.getElementById('root')?.appendChild(dialog.root);
    });

    teardown(() => {
        harness.dispose();
    });

    function query<T extends Element>(selector: string): T {
        const node = dialog.root.querySelector<T>(selector);

        assert.ok(node, `expected ${selector}`);

        return node;
    }

    function queryAll<T extends Element>(selector: string): T[] {
        return [...dialog.root.querySelectorAll<T>(selector)];
    }

    function lastMessage(type: PanelMessage['type']): PanelMessage | undefined {
        return [...harness.posted].reverse().find((message) => message.type === type);
    }

    test('stays hidden until it is opened', () => {
        assert.equal(dialog.root.classList.contains('is-open'), false);
        dialog.open();
        assert.equal(dialog.root.classList.contains('is-open'), true);
    });

    test('lists every environment and marks the one in use', () => {
        dialog.open();

        assert.deepEqual(
            queryAll('.env-row-name').map((node) => node.textContent),
            ['Dev', 'Prod']
        );
        assert.equal(queryAll('.env-dot.is-on').length, 1);
    });

    test('shows the variables of the selected environment', () => {
        dialog.open();

        assert.deepEqual(
            queryAll<HTMLInputElement>('.env-var-key').map((node) => node.value),
            ['baseUrl', 'apiKey']
        );
        assert.deepEqual(
            queryAll<HTMLInputElement>('.env-var-value').map((node) => node.type),
            ['text', 'password']
        );
    });

    test('creates an environment from a field in the dialog, not a native prompt', () => {
        dialog.open();
        query<HTMLButtonElement>('.env-new').click();

        const field = query<HTMLInputElement>('.env-new-field');

        field.value = 'Staging';
        field.dispatchEvent(
            new harness.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );

        assert.deepEqual(lastMessage('createEnvironment'), {
            type: 'createEnvironment',
            name: 'Staging',
        });
    });

    test('renames by editing the title in place', () => {
        dialog.open();

        const title = query<HTMLInputElement>('.env-title-field');

        title.value = 'Development';
        title.dispatchEvent(new harness.window.Event('change', { bubbles: true }));

        assert.deepEqual(lastMessage('renameEnvironment'), {
            type: 'renameEnvironment',
            id: 'e1',
            name: 'Development',
        });
    });

    test('asks before deleting, and only then reports it', () => {
        dialog.open();

        const remove = queryAll<HTMLButtonElement>('.env-detail-actions .icon-btn').at(-1);

        assert.ok(remove);
        remove.click();
        assert.equal(lastMessage('removeEnvironment'), undefined, 'deleted without confirming');

        query<HTMLButtonElement>('.env-confirm').click();
        assert.deepEqual(lastMessage('removeEnvironment'), {
            type: 'removeEnvironment',
            id: 'e1',
        });
    });

    test('switches the environment in use from the dialog', () => {
        dialog.open();
        query<HTMLButtonElement>('.env-use').click();

        assert.deepEqual(lastMessage('selectEnvironment'), {
            type: 'selectEnvironment',
            id: null,
        });
    });

    test('saves a variable when the field is committed', () => {
        dialog.open();

        const value = queryAll<HTMLInputElement>('.env-var-value')[0];

        value.value = 'https://changed.test';
        value.dispatchEvent(new harness.window.Event('change', { bubbles: true }));

        const saved = lastMessage('saveVariables');

        assert.ok(saved && saved.type === 'saveVariables');
        assert.equal(saved.id, 'e1');
        assert.equal(saved.variables[0].value, 'https://changed.test');
    });

    test('marks a variable secret from the dialog', () => {
        dialog.open();
        queryAll<HTMLButtonElement>('.env-secret')[0].click();

        const saved = lastMessage('saveVariables');

        assert.ok(saved && saved.type === 'saveVariables');
        assert.equal(saved.variables[0].secret, true);
    });

    test('grows a blank row so there is always somewhere to type', () => {
        dialog.open();

        const keys = queryAll<HTMLInputElement>('.env-var-key');
        const last = keys[keys.length - 1];

        last.value = 'newOne';
        last.dispatchEvent(new harness.window.Event('change', { bubbles: true }));

        const saved = lastMessage('saveVariables');

        assert.ok(saved && saved.type === 'saveVariables');
        assert.equal(saved.variables.length, 3);
        assert.equal(saved.variables[2].key, '');
    });

    test('offers a blank row for an environment with no variables', () => {
        dialog.open();
        queryAll<HTMLElement>('.env-row')[1].click();

        assert.equal(queryAll('.env-var-key').length, 1);
        assert.equal(query<HTMLInputElement>('.env-title-field').value, 'Prod');
    });

    test('closes on the overlay and on Escape', () => {
        dialog.open();
        query<HTMLElement>('.dialog-overlay').click();
        assert.equal(dialog.root.classList.contains('is-open'), false);

        dialog.open();
        harness.window.document.dispatchEvent(
            new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        assert.equal(dialog.root.classList.contains('is-open'), false);
    });
});

suite('editing a variable keeps the field you are in', () => {
    let harness: WebviewHarness;
    let dialog: { root: HTMLElement; open(): void };

    setup(() => {
        harness = mountWebview();
        harness.store.setEnvironment({
            activeId: 'e1',
            environments: [
                {
                    id: 'e1',
                    name: 'Dev',
                    createdAt: 0,
                    updatedAt: 0,
                    variables: [
                        { id: 'v1', key: 'a', value: '1', enabled: true, secret: false },
                        { id: 'v2', key: 'b', value: '2', enabled: true, secret: false },
                    ],
                },
            ],
            collection: null,
            dynamic: [],
        });
        dialog = harness.createEnvironmentDialog();
        harness.window.document.getElementById('root')?.appendChild(dialog.root);
        dialog.open();
    });

    teardown(() => {
        harness.dispose();
    });

    function values(): HTMLInputElement[] {
        return [...dialog.root.querySelectorAll<HTMLInputElement>('.env-var-value')];
    }

    function keys(): HTMLInputElement[] {
        return [...dialog.root.querySelectorAll<HTMLInputElement>('.env-var-key')];
    }

    function commit(input: HTMLInputElement, text: string): void {
        input.value = text;
        input.dispatchEvent(new harness.window.Event('change', { bubbles: true }));
    }

    test('leaves the next field focused after committing the previous one', () => {
        const fields = values();

        fields[1].focus();
        commit(fields[0], 'changed');

        assert.equal(
            harness.window.document.activeElement,
            fields[1],
            'tabbing to the next field must not lose focus'
        );
        assert.equal(harness.window.document.body.contains(fields[1]), true);
    });

    test('does not rebuild the rows the user is working in', () => {
        const before = values();

        commit(before[0], 'changed');

        const after = values();

        assert.equal(after.length, before.length);
        assert.equal(after[0], before[0], 'the edited row was recreated');
        assert.equal(after[1], before[1], 'a neighbouring row was recreated');
    });

    test('still reports the edit to the host', () => {
        commit(values()[0], 'changed');

        const saved = [...harness.posted]
            .reverse()
            .find((message) => message.type === 'saveVariables');

        assert.ok(saved && saved.type === 'saveVariables');
        assert.equal(saved.variables[0].value, 'changed');
    });

    test('survives the host echoing the state back', () => {
        const fields = values();

        fields[1].focus();
        commit(fields[0], 'changed');
        harness.store.commit();

        assert.equal(
            harness.window.document.activeElement,
            fields[1],
            'the echo from the host must not repaint over the field'
        );
    });

    test('adds the blank row without disturbing the field in use', () => {
        const keyFields = keys();
        const last = keyFields[keyFields.length - 1];

        values()[0].focus();
        commit(last, 'named');

        assert.equal(keys().length, 3, 'a blank row should appear');
        assert.equal(harness.window.document.activeElement, values()[0]);
    });

    test('keeps the value masked in step with the lock', () => {
        const button = dialog.root.querySelector<HTMLButtonElement>('.env-secret');

        assert.ok(button);
        assert.equal(values()[0].type, 'text');

        button.click();

        assert.equal(values()[0].type, 'password');
        assert.equal(button.classList.contains('is-on'), true);
        assert.equal(
            dialog.root.querySelector('.env-secret'),
            button,
            'the row should not have been rebuilt'
        );
    });

    test('removes only the row that was deleted', () => {
        const before = values();
        const remove = [...dialog.root.querySelectorAll<HTMLButtonElement>('.env-var .icon-btn')];

        remove[0].click();

        assert.equal(values().length, 1);
        assert.equal(values()[0], before[1], 'the surviving row was recreated');
    });

    test('repaints when something other than a value changes', () => {
        const before = values();

        harness.store.mutate((draft) => {
            draft.environment.environments[0].name = 'Renamed';
        });
        harness.store.commit();

        assert.equal(
            dialog.root.querySelector<HTMLInputElement>('.env-title-field')?.value,
            'Renamed'
        );
        assert.equal(values()[0], before[0], 'the rows were needlessly rebuilt');
    });

    test('repaints when a variable is added somewhere else', () => {
        const before = values();

        harness.store.mutate((draft) => {
            draft.environment.environments[0].variables.push({
                id: 'v3',
                key: 'c',
                value: '3',
                enabled: true,
                secret: false,
            });
        });

        assert.equal(values().length, 3);
        assert.equal(values()[2].value, '3');
        assert.equal(values()[0], before[0], 'the untouched rows were rebuilt');
    });
});
