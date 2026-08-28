import { HTTP_METHODS } from '../../core/constants';
import { buildCurlCommand } from '../../core/curl';
import type { HttpMethod } from '../../core/types';
import { post, schedulePersist } from '../bridge';
import { applyCurl } from '../curlImport';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { emit, on, state } from '../store';
import { createSelect } from './select';
import { createSettingsMenu } from './settingsMenu';
import { createVariableInput } from './variableInput';

export function createUrlBar(options: { onSend: () => void; onCancel: () => void }): HTMLElement {
    const shell = el('div', {
        class: `url-shell method-border-${state.snapshot.method.toLowerCase()}`,
    });
    const methodSelect = createSelect<HttpMethod>({
        value: state.snapshot.method,
        ariaLabel: 'HTTP method',
        className: 'select-method',
        items: HTTP_METHODS.map((method) => ({
            value: method,
            label: method,
            className: `method-${method.toLowerCase()}`,
        })),
        onChange: (method) => {
            state.snapshot.method = method;
            shell.className = `url-shell method-border-${method.toLowerCase()}`;
            schedulePersist();
        },
    });
    const url = createVariableInput({
        value: state.snapshot.url,
        className: 'url-input',
        placeholder: 'https://api.example.com/endpoint',
        ariaLabel: 'Request URL',
        onInput: (value) => {
            state.snapshot.url = value;
            schedulePersist();
        },
        onEnter: () => options.onSend(),
        onPaste: (event) => {
            const pasted = event.clipboardData?.getData('text');

            if (pasted && applyCurl(pasted)) {
                event.preventDefault();
                emit();
                schedulePersist();
                post({ type: 'notify', level: 'info', text: 'cURL command imported.' });

                return true;
            }

            return false;
        },
    });
    const urlInput = url.input;

    shell.append(methodSelect.root, el('div', { class: 'url-divider' }), url.root);
    const sendLabel = el('span', { text: 'Send' });
    const sendIcon = el('span', { class: 'send-icon' }, icon('send'));
    const sendButton = el(
        'button',
        {
            class: 'send-btn',
            type: 'button',
            on: {
                click: () => (state.loading ? options.onCancel() : options.onSend()),
            },
        },
        sendIcon,
        sendLabel
    );
    const menu = createSendMenu();
    const settings = createSettingsMenu();
    const environment = createEnvironmentPicker();
    const bar = el(
        'div',
        { class: 'url-bar' },
        shell,
        el('div', { class: 'send-group' }, sendButton, menu.root),
        environment.root,
        settings.root
    );

    on('method', () => {
        methodSelect.setValue(state.snapshot.method);
        shell.className = `url-shell method-border-${state.snapshot.method.toLowerCase()}`;
    });
    on('url', () => {
        if (urlInput.value !== state.snapshot.url) {
            urlInput.value = state.snapshot.url;
        }

        url.refresh();
    });
    on('response', () => {
        sendButton.classList.toggle('is-loading', state.loading);
        sendLabel.textContent = state.loading ? 'Cancel' : 'Send';
        replace(sendIcon, icon(state.loading ? 'stop' : 'send'));
    });

    return bar;
}

function createSendMenu(): {
    root: HTMLElement;
} {
    const list = el('div', { class: 'menu-list' });
    const trigger = el(
        'button',
        {
            class: 'send-caret',
            type: 'button',
            attrs: { 'aria-label': 'More send options' },
            on: {
                click: (event) => {
                    event.stopPropagation();
                    root.classList.toggle('is-open');
                },
            },
        },
        icon('chevronDown')
    );
    const root = el('div', { class: 'menu' }, trigger, el('div', { class: 'menu-popup' }, list));
    const item = (name: 'copy' | 'terminal' | 'link', label: string, onClick: () => void) =>
        el(
            'button',
            {
                class: 'menu-item',
                type: 'button',
                on: {
                    click: () => {
                        root.classList.remove('is-open');
                        onClick();
                    },
                },
            },
            icon(name),
            label
        );

    list.append(
        item('copy', 'Copy URL', () => {
            if (state.snapshot.url.trim()) {
                post({ type: 'copy', text: state.snapshot.url.trim(), label: 'URL' });
            }
        }),
        item('terminal', 'Copy as cURL', () => {
            if (!state.snapshot.url.trim()) {
                return;
            }

            try {
                post({
                    type: 'copy',
                    text: buildCurlCommand(state.snapshot),
                    label: 'cURL command',
                });
            } catch {
                post({ type: 'notify', level: 'warn', text: 'The URL is not valid yet.' });
            }
        })
    );
    document.addEventListener('mousedown', (event) => {
        if (!(event.target as HTMLElement | null)?.closest('.menu')) {
            root.classList.remove('is-open');
        }
    });

    return { root };
}

function createEnvironmentPicker(): { root: HTMLElement } {
    const label = el('span', { class: 'env-pick-label' });
    const list = el('div', { class: 'menu-list' });
    const trigger = el(
        'button',
        {
            class: 'env-pick',
            type: 'button',
            title: 'Environment used to resolve {{variables}}',
            attrs: { 'aria-label': 'Environment' },
            on: {
                click: (event) => {
                    event.stopPropagation();
                    root.classList.toggle('is-open');
                },
            },
        },
        icon('layers'),
        label
    );
    const root = el(
        'div',
        { class: 'menu env-menu' },
        trigger,
        el('div', { class: 'menu-popup' }, list)
    );
    const choose = (id: string | null) => {
        root.classList.remove('is-open');
        post({ type: 'selectEnvironment', id });
    };
    const paint = () => {
        const { environment } = state;

        label.textContent = environment.name || 'No environment';
        trigger.classList.toggle('is-set', environment.id !== null);
        replace(
            list,
            el(
                'button',
                {
                    class: `menu-item${environment.id === null ? ' is-selected' : ''}`,
                    type: 'button',
                    on: { click: () => choose(null) },
                },
                'No environment'
            ),
            ...environment.names.map((entry) =>
                el(
                    'button',
                    {
                        class: `menu-item${entry.id === environment.id ? ' is-selected' : ''}`,
                        type: 'button',
                        on: { click: () => choose(entry.id) },
                    },
                    entry.name
                )
            ),
            el('div', { class: 'menu-divider' }),
            el(
                'button',
                {
                    class: 'menu-item',
                    type: 'button',
                    on: {
                        click: () => {
                            root.classList.remove('is-open');
                            post({ type: 'manageEnvironments' });
                        },
                    },
                },
                icon('settings'),
                'Manage environments'
            )
        );
    };

    document.addEventListener('mousedown', (event) => {
        if (!(event.target as HTMLElement | null)?.closest('.env-menu')) {
            root.classList.remove('is-open');
        }
    });
    on('environment', paint);
    paint();

    return { root };
}
