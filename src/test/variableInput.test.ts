import * as assert from 'node:assert/strict';
import type { PanelMessage } from '../core/messages';
import type { Variable } from '../core/variables';
import { mountWebview, type WebviewHarness, webviewState } from './webviewHarness';

function variable(key: string, value: string, extra: Partial<Variable> = {}): Variable {
    return { id: key, key, value, enabled: true, secret: false, ...extra };
}

const VARIABLES = [
    variable('baseUrl', 'https://api.dev.test'),
    variable('basePath', '/v1'),
    variable('token', 'abc123'),
    variable('apiKey', 'shh', { secret: true }),
    variable('legacy', 'x', { enabled: false }),
];

suite('typing a variable into a field', () => {
    let harness: WebviewHarness;
    let input: HTMLInputElement;
    let root: HTMLElement;
    let latest = '';

    setup(() => {
        harness = mountWebview();
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                {
                    id: 'e1',
                    name: 'Dev',
                    createdAt: 0,
                    updatedAt: 0,
                    variables: VARIABLES,
                },
            ],
        };

        const handle = harness.createVariableInput({
            value: '',
            ariaLabel: 'Request URL',
            onInput: (value) => (latest = value),
        });

        root = handle.root;
        input = handle.input;
        harness.window.document.getElementById('root')?.appendChild(root);
    });

    teardown(() => {
        harness.dispose();
    });

    function type(value: string, caret = value.length): void {
        input.value = value;
        input.setSelectionRange(caret, caret);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function press(key: string): void {
        input.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key, bubbles: true }));
    }

    function popup(): HTMLElement {
        const node = harness.window.document.querySelector<HTMLElement>('.variable-popup');

        assert.ok(node, 'expected the suggestion overlay');

        return node;
    }

    function options(): string[] {
        return [...popup().querySelectorAll('.variable-option-key')].map(
            (node) => node.textContent ?? ''
        );
    }

    test('stays closed while there is no open token', () => {
        type('https://api');
        assert.equal(popup().classList.contains('is-open'), false);
    });

    test('opens as soon as the braces are typed', () => {
        type('{{');
        assert.equal(popup().classList.contains('is-open'), true);
        assert.deepEqual(options(), ['apiKey', 'basePath', 'baseUrl', 'token']);
    });

    test('narrows the list as the name is typed', () => {
        type('{{base');
        assert.deepEqual(options(), ['basePath', 'baseUrl']);
    });

    test('leaves out a disabled variable', () => {
        type('{{leg');
        assert.equal(popup().classList.contains('is-open'), false);
    });

    test('hides the value of a secret variable', () => {
        type('{{api');

        const value = popup().querySelector('.variable-option-value');

        assert.equal(value?.textContent, '••••••');
    });

    test('shows the value of an ordinary variable', () => {
        type('{{token');

        const value = popup().querySelector('.variable-option-value');

        assert.equal(value?.textContent, 'abc123');
    });

    test('completes the token on Enter and reports the new text', () => {
        type('https://{{base');
        press('Enter');

        assert.equal(input.value, 'https://{{basePath}}');
        assert.equal(latest, 'https://{{basePath}}');
        assert.equal(popup().classList.contains('is-open'), false);
    });

    test('walks the list with the arrow keys', () => {
        type('{{base');
        press('ArrowDown');
        press('Enter');

        assert.equal(input.value, '{{baseUrl}}');
    });

    test('wraps around when walking past the end', () => {
        type('{{base');
        press('ArrowUp');
        press('Enter');

        assert.equal(input.value, '{{baseUrl}}');
    });

    test('completes on Tab as well', () => {
        type('{{tok');
        press('Tab');

        assert.equal(input.value, '{{token}}');
    });

    test('closes on Escape without changing the text', () => {
        type('{{base');
        press('Escape');

        assert.equal(popup().classList.contains('is-open'), false);
        assert.equal(input.value, '{{base');
    });

    test('leaves the caret after the completed token', () => {
        type('https://{{base');
        press('Enter');

        assert.equal(input.selectionStart, 'https://{{basePath}}'.length);
    });

    test('keeps what was typed after the caret', () => {
        type('{{base}}/users', 6);
        press('Enter');

        assert.equal(input.value, '{{basePath}}/users');
    });

    test('closes once the token is complete', () => {
        type('{{baseUrl}}');
        assert.equal(popup().classList.contains('is-open'), false);
    });
});

suite('showing a variable in a field', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                {
                    id: 'e1',
                    name: 'Dev',
                    createdAt: 0,
                    updatedAt: 0,
                    variables: VARIABLES,
                },
            ],
        };
    });

    teardown(() => {
        harness.dispose();
    });

    function backdropOf(value: string): HTMLElement {
        const handle = harness.createVariableInput({
            value,
            ariaLabel: 'Request URL',
            onInput: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(handle.root);

        const backdrop = handle.root.querySelector<HTMLElement>('.variable-backdrop');

        assert.ok(backdrop);

        return backdrop;
    }

    test('paints each token and leaves the rest as plain text', () => {
        const backdrop = backdropOf('{{baseUrl}}/users/{{id}}');

        assert.deepEqual(
            [...backdrop.querySelectorAll('.variable-token')].map((node) => node.textContent),
            ['{{baseUrl}}', '{{id}}']
        );
        assert.equal(backdrop.textContent, '{{baseUrl}}/users/{{id}}');
    });

    test('marks a name the active environment does not define', () => {
        const backdrop = backdropOf('{{baseUrl}}/{{nope}}');
        const tokens = [...backdrop.querySelectorAll('.variable-token')];

        assert.deepEqual(
            tokens.map((node) => [node.textContent, node.classList.contains('is-unknown')]),
            [
                ['{{baseUrl}}', false],
                ['{{nope}}', true],
            ]
        );
    });

    test('marks every name when no environment is chosen', () => {
        harness.store.state.environment = { activeId: null, environments: [] };

        const backdrop = backdropOf('{{baseUrl}}');

        assert.equal(
            backdrop.querySelector('.variable-token')?.classList.contains('is-unknown'),
            true
        );
    });

    test('paints nothing when there is no token', () => {
        const backdrop = backdropOf('https://api.test/users');

        assert.equal(backdrop.querySelector('.variable-token'), null);
        assert.equal(backdrop.textContent, 'https://api.test/users');
    });

    test('renders the text as characters rather than markup', () => {
        const backdrop = backdropOf('<script>alert(1)</script>{{a}}');

        assert.equal(backdrop.querySelector('script'), null);
        assert.equal(backdrop.textContent, '<script>alert(1)</script>{{a}}');
    });
});

suite('variables reach the request panel', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
    });

    teardown(() => {
        harness.dispose();
    });

    test('sends the URL exactly as it was written', () => {
        harness.store.hydrate(webviewState({ url: '' }, 'req-1'), {
            id: 'req-1',
            name: 'Listar',
            location: '',
        });
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                {
                    id: 'e1',
                    name: 'Dev',
                    createdAt: 0,
                    updatedAt: 0,
                    variables: VARIABLES,
                },
            ],
        };

        const bar = harness.createUrlBar({
            onSend: harness.actions.send,
            onCancel: harness.actions.cancel,
        });

        harness.window.document.getElementById('root')?.appendChild(bar);

        const input = harness.window.document.querySelector<HTMLInputElement>(
            '.url-input .variable-field'
        );

        assert.ok(input);
        input.value = '{{baseUrl}}/apartamentos';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        harness.window.document.querySelector<HTMLButtonElement>('.send-btn')?.click();

        const sent = [...harness.posted].reverse().find((message) => message.type === 'send') as
            Extract<PanelMessage, { type: 'send' }> | undefined;

        assert.ok(sent);
        assert.equal(sent.snapshot.url, '{{baseUrl}}/apartamentos');
    });

    test('offers the environments it was told about', () => {
        harness.store.hydrate(webviewState({}, null), { id: null, name: '', location: '' });
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                { id: 'e1', name: 'Dev', createdAt: 0, updatedAt: 0, variables: [] },
                { id: 'e2', name: 'Prod', createdAt: 0, updatedAt: 0, variables: [] },
            ],
        };

        const header = harness.createRequestHeader({
            onSave: () => {},
            onManageEnvironments: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(header);
        harness.store.emit('environment');

        const label = harness.window.document.querySelector('.env-pick-label');

        assert.equal(label?.textContent, 'Dev');

        const items = [...harness.window.document.querySelectorAll('.env-menu .menu-item')].map(
            (node) => node.textContent
        );

        assert.deepEqual(items.slice(0, 3), ['No environment', 'Dev', 'Prod']);
    });

    test('asks the host to switch environment when one is picked', () => {
        harness.store.hydrate(webviewState({}, null), { id: null, name: '', location: '' });
        harness.store.state.environment = {
            activeId: null,
            environments: [{ id: 'e2', name: 'Prod', createdAt: 0, updatedAt: 0, variables: [] }],
        };

        const header = harness.createRequestHeader({
            onSave: () => {},
            onManageEnvironments: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(header);
        harness.store.emit('environment');

        const items = [...harness.window.document.querySelectorAll('.env-menu .menu-item')];
        const prod = items.find((node) => node.textContent === 'Prod') as HTMLButtonElement;

        assert.ok(prod);
        prod.click();

        const picked = harness.posted.find((message) => message.type === 'selectEnvironment');

        assert.deepEqual(picked, { type: 'selectEnvironment', id: 'e2' });
    });
});

suite('the styled box stays on the element the stylesheet targets', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                { id: 'e1', name: 'Dev', createdAt: 0, updatedAt: 0, variables: VARIABLES },
            ],
        };
    });

    teardown(() => {
        harness.dispose();
    });

    test('puts the caller class on the wrapper and keeps the field bare', () => {
        const handle = harness.createVariableInput({
            value: '',
            className: 'field kv-key',
            ariaLabel: 'Parameter',
            onInput: () => {},
        });

        assert.deepEqual([...handle.root.classList].sort(), ['field', 'kv-key', 'variable-input']);
        assert.deepEqual([...handle.input.classList], ['variable-field']);
        assert.equal(handle.input.parentElement, handle.root);
    });

    test('keeps the url bar box on the wrapper so the row stays aligned', () => {
        harness.store.hydrate(webviewState({ url: '' }, null), {
            id: null,
            name: '',
            location: '',
        });

        const bar = harness.createUrlBar({
            onSend: harness.actions.send,
            onCancel: harness.actions.cancel,
        });

        harness.window.document.getElementById('root')?.appendChild(bar);

        const wrapper = harness.window.document.querySelector('.url-input');

        assert.ok(wrapper);
        assert.equal(wrapper.classList.contains('variable-input'), true);
        assert.equal(wrapper.parentElement?.classList.contains('url-shell'), true);
        assert.ok(wrapper.querySelector('.variable-field'));
        assert.ok(wrapper.querySelector('.variable-backdrop'));
    });

    test('gives every key and value row the same box the plain fields had', () => {
        harness.store.hydrate(
            webviewState({
                params: [{ id: 'p', key: 'page', value: '2', enabled: true }],
            }),
            { id: null, name: '', location: '' }
        );

        const editor = harness.createRequestEditor();

        harness.window.document.getElementById('root')?.appendChild(editor);

        for (const selector of ['.kv-key', '.kv-value']) {
            const node = harness.window.document.querySelector(selector);

            assert.ok(node, `expected ${selector}`);
            assert.equal(node.classList.contains('field'), true, `${selector} lost its box`);
            assert.equal(node.classList.contains('variable-input'), true);
        }
    });

    test('leaves the environment picker out of the url bar', () => {
        harness.store.hydrate(webviewState({}), { id: null, name: '', location: '' });

        const bar = harness.createUrlBar({
            onSend: harness.actions.send,
            onCancel: harness.actions.cancel,
        });

        assert.equal(bar.querySelector('.env-menu'), null);

        const header = harness.createRequestHeader({
            onSave: () => {},
            onManageEnvironments: () => {},
        });

        assert.ok(header.querySelector('.request-tools .env-menu'));
    });
});

suite('the suggestion list floats above the panel', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                { id: 'e1', name: 'Dev', createdAt: 0, updatedAt: 0, variables: VARIABLES },
            ],
        };
    });

    teardown(() => {
        harness.dispose();
    });

    function fieldIn(className: string): HTMLInputElement {
        const handle = harness.createVariableInput({
            value: '',
            className,
            ariaLabel: 'Field',
            onInput: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(handle.root);

        return handle.input;
    }

    function typeInto(input: HTMLInputElement, value: string): void {
        input.value = value;
        input.setSelectionRange(value.length, value.length);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    test('lives outside the field so no ancestor can clip or resize it', () => {
        const input = fieldIn('field kv-value');

        typeInto(input, '{{');

        const popup = harness.window.document.querySelector('.variable-popup');

        assert.ok(popup);
        assert.equal(popup.parentElement, harness.window.document.body);
        assert.equal(popup.closest('.variable-input'), null, 'the list is still inside the field');
        assert.equal(popup.closest('.url-shell'), null);
    });

    test('keeps one list open at a time', () => {
        const first = fieldIn('field kv-key');
        const second = fieldIn('field kv-value');

        typeInto(first, '{{');
        typeInto(second, '{{');

        const open = harness.window.document.querySelectorAll('.variable-popup.is-open');

        assert.equal(open.length, 1);
    });

    test('shows the name and a trimmed value, hiding a secret', () => {
        const input = fieldIn('field kv-value');

        typeInto(input, '{{');

        const options = [
            ...harness.window.document.querySelectorAll('.variable-popup.is-open .variable-option'),
        ];
        const secret = options.find(
            (node) => node.querySelector('.variable-option-key')?.textContent === 'apiKey'
        );

        assert.ok(secret);
        assert.equal(secret.querySelector('.variable-option-value')?.textContent, '••••••');
        assert.equal(secret.getAttribute('title'), 'apiKey');
    });

    test('takes the list away when the field is thrown away', () => {
        const handle = harness.createVariableInput({
            value: '',
            className: 'field',
            ariaLabel: 'Field',
            onInput: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(handle.root);
        assert.equal(harness.window.document.querySelectorAll('.variable-popup').length, 1);

        handle.destroy();
        assert.equal(harness.window.document.querySelectorAll('.variable-popup').length, 0);
    });
});

suite('variables reach the auth fields', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
        harness.store.state.environment = {
            activeId: 'e1',
            environments: [
                { id: 'e1', name: 'Dev', createdAt: 0, updatedAt: 0, variables: VARIABLES },
            ],
        };
    });

    teardown(() => {
        harness.dispose();
    });

    test('an auth text field paints tokens and suggests names', () => {
        harness.store.hydrate(
            webviewState({
                auth: { type: 'bearer', token: 'x', prefix: '{{token}}' },
            }),
            { id: null, name: '', location: '' }
        );

        const editor = harness.createRequestEditor();

        harness.window.document.getElementById('root')?.appendChild(editor);

        const tabs = [...harness.window.document.querySelectorAll<HTMLButtonElement>('.tab')];

        tabs.find((tab) => (tab.textContent ?? '').startsWith('Auth'))?.click();

        const painted = harness.window.document.querySelector(
            '.pane .variable-input .variable-token'
        );

        assert.ok(painted, 'the auth field should paint the token');
        assert.equal(painted.textContent, '{{token}}');
    });
});
