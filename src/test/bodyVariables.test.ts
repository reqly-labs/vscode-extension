import * as assert from 'node:assert/strict';
import type { Variable } from '../core/variables';
import { mountWebview, type WebviewHarness } from './webviewHarness';

function variable(key: string, value: string, extra: Partial<Variable> = {}): Variable {
    return { id: key, key, value, enabled: true, secret: false, ...extra };
}

suite('variables in the request body', () => {
    let harness: WebviewHarness;
    let root: HTMLElement;
    let textarea: HTMLTextAreaElement;
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
                    variables: [
                        variable('token', 'abc123'),
                        variable('tokenId', '7'),
                        variable('baseUrl', 'https://api.dev.test'),
                    ],
                },
            ],
            collection: null,
            dynamic: [],
        };

        const editor = harness.createEditor({
            value: '',
            language: 'json',
            onChange: (value) => (latest = value),
        });

        root = editor.root;
        harness.window.document.getElementById('root')?.appendChild(root);

        const input = root.querySelector<HTMLTextAreaElement>('.code-input');

        assert.ok(input);
        textarea = input;
    });

    teardown(() => {
        harness.dispose();
    });

    function type(value: string, caret = value.length): void {
        textarea.value = value;
        textarea.setSelectionRange(caret, caret);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function press(key: string): void {
        textarea.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key, bubbles: true }));
    }

    function popup(): HTMLElement {
        const node = harness.window.document.querySelector<HTMLElement>('.variable-popup');

        assert.ok(node);

        return node;
    }

    function layer(): HTMLElement {
        const node = root.querySelector<HTMLElement>('.code-layer');

        assert.ok(node);

        return node;
    }

    test('paints a token written in the body', () => {
        type('{"token":"{{token}}"}');

        assert.deepEqual(
            [...layer().querySelectorAll('.variable-token')].map((node) => node.textContent),
            ['{{token}}']
        );
    });

    test('marks a name the environment does not define', () => {
        type('{"a":"{{token}}","b":"{{missing}}"}');

        assert.deepEqual(
            [...layer().querySelectorAll('.variable-token')].map((node) => [
                node.textContent,
                node.classList.contains('is-unknown'),
            ]),
            [
                ['{{token}}', false],
                ['{{missing}}', true],
            ]
        );
    });

    test('keeps the body text exactly as typed', () => {
        type('{"a":"{{token}}","b":2}');
        assert.equal(layer().textContent?.trimEnd(), '{"a":"{{token}}","b":2}');
    });

    function pressKey(key: string): boolean {
        return !textarea.dispatchEvent(
            new harness.window.KeyboardEvent('keydown', {
                key,
                bubbles: true,
                cancelable: true,
            })
        );
    }

    test('suggests variables when the braces are typed key by key', () => {
        textarea.value = '';
        textarea.setSelectionRange(0, 0);

        assert.equal(pressKey('{'), true, 'the editor should auto-close the brace');
        assert.equal(pressKey('{'), true, 'the editor should auto-close the second brace');
        assert.equal(textarea.value, '{{}}', 'the editor should have closed both braces');
        assert.equal(
            popup().classList.contains('is-open'),
            true,
            'auto-closing the braces must still offer the variables'
        );
    });

    test('completes without doubling the auto-closed braces', () => {
        type('{{tok}}', 5);
        press('Enter');

        assert.equal(textarea.value, '{{token}}');
    });

    test('suggests variables once the braces are typed', () => {
        type('{"token":"{{');

        assert.equal(popup().classList.contains('is-open'), true);
        assert.deepEqual(
            [...popup().querySelectorAll('.variable-option-key')].map((node) => node.textContent),
            ['baseUrl', 'token', 'tokenId']
        );
    });

    test('narrows the suggestions as the name is typed', () => {
        type('{"token":"{{tokenI');

        assert.deepEqual(
            [...popup().querySelectorAll('.variable-option-key')].map((node) => node.textContent),
            ['tokenId']
        );
    });

    test('completes the token and reports the new body', () => {
        type('{"token":"{{tok');
        press('Enter');

        assert.equal(textarea.value, '{"token":"{{token}}');
        assert.equal(latest, '{"token":"{{token}}');
        assert.equal(popup().classList.contains('is-open'), false);
    });

    test('walks the suggestions with the arrows', () => {
        type('{{tok');
        press('ArrowDown');
        press('Enter');

        assert.equal(textarea.value, '{{tokenId}}');
    });

    test('closes on Escape and leaves the text alone', () => {
        type('{{tok');
        press('Escape');

        assert.equal(popup().classList.contains('is-open'), false);
        assert.equal(textarea.value, '{{tok');
    });

    test('does not steal Enter when there is nothing to suggest', () => {
        type('{"a":1}');
        press('Enter');

        assert.equal(popup().classList.contains('is-open'), false);
    });

    test('stays closed while the body has no open token', () => {
        type('{"a":"plain"}');
        assert.equal(popup().classList.contains('is-open'), false);
    });
});

suite('variables are not read into a response body', () => {
    let harness: WebviewHarness;

    setup(() => {
        harness = mountWebview();
    });

    teardown(() => {
        harness.dispose();
    });

    test('a server answering with braces is shown as plain text', () => {
        const editor = harness.createEditor({
            value: '',
            language: 'json',
            onChange: () => {},
        });

        harness.window.document.getElementById('root')?.appendChild(editor.root);

        const highlight = harness.highlight;

        harness.window.document.body.innerHTML += '<div id="probe"></div>';

        const probe = harness.window.document.getElementById('probe') as HTMLElement;

        probe.innerHTML = highlight('{"quote":"{{not a variable}}"}', 'json');

        assert.equal(probe.querySelector('.variable-token'), null);
        assert.equal(probe.textContent, '{"quote":"{{not a variable}}"}');
    });
});
