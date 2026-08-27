import { HTTP_METHODS } from '../../core/constants';
import { buildCurlCommand } from '../../core/curl';
import type { HttpMethod } from '../../core/types';
import { post, schedulePersist } from '../bridge';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { emit, on, state } from '../store';
import { applyCurl } from '../curlImport';
import { createSelect } from './select';
import { createSettingsMenu } from './settingsMenu';

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
    const urlInput = el('input', {
        class: 'url-input',
        value: state.snapshot.url,
        spellcheck: false,
        placeholder: 'https://api.example.com/endpoint',
        attrs: { 'aria-label': 'Request URL' },
        on: {
            input: (event) => {
                state.snapshot.url = (event.target as HTMLInputElement).value;
                schedulePersist();
            },
            keydown: (event) => {
                if ((event as KeyboardEvent).key === 'Enter') {
                    event.preventDefault();
                    options.onSend();
                }
            },
            paste: (event) => {
                const pasted = (event as ClipboardEvent).clipboardData?.getData('text');

                if (pasted && applyCurl(pasted)) {
                    event.preventDefault();
                    urlInput.value = state.snapshot.url;
                    methodSelect.setValue(state.snapshot.method);
                    shell.className = `url-shell method-border-${state.snapshot.method.toLowerCase()}`;
                    emit('params', 'headers', 'body', 'auth', 'requestTab');
                    schedulePersist();
                    post({ type: 'notify', level: 'info', text: 'cURL command imported.' });
                }
            },
        },
    });

    shell.append(methodSelect.root, el('div', { class: 'url-divider' }), urlInput);
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
    const bar = el(
        'div',
        { class: 'url-bar' },
        shell,
        el('div', { class: 'send-group' }, sendButton, menu.root),
        settings.root
    );

    on('method', () => {
        methodSelect.setValue(state.snapshot.method);
        shell.className = `url-shell method-border-${state.snapshot.method.toLowerCase()}`;
    });
    on('url', () => {
        urlInput.value = state.snapshot.url;
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
