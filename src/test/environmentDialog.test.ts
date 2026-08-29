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
        harness.store.state.environment = { activeId: 'e1', environments: [DEV, PROD] };
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
