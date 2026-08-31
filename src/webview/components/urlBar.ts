import { HTTP_METHODS } from '../../core/constants';
import { buildCurlCommand } from '../../core/curl';
import type { HttpMethod } from '../../core/types';
import { post, schedulePersist } from '../bridge';
import { applyCurl } from '../curlImport';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { getState, mutate, persistable, watch } from '../store';
import { createSelect } from './select';
import { createSettingsMenu } from './settingsMenu';
import { createVariableInput } from './variableInput';

export function createUrlBar(options: { onSend: () => void; onCancel: () => void }): HTMLElement {
    const shell = el('div', {
        class: `url-shell method-border-${getState().snapshot.method.toLowerCase()}`,
    });
    const methodSelect = createSelect<HttpMethod>({
        value: getState().snapshot.method,
        ariaLabel: 'HTTP method',
        className: 'select-method',
        items: HTTP_METHODS.map((method) => ({
            value: method,
            label: method,
            className: `method-${method.toLowerCase()}`,
        })),
        onChange: (method) => {
            mutate((draft) => {
                draft.snapshot.method = method;
            });
            shell.className = `url-shell method-border-${method.toLowerCase()}`;
            schedulePersist();
        },
    });
    const url = createVariableInput({
        value: getState().snapshot.url,
        className: 'url-input',
        placeholder: 'https://api.example.com/endpoint',
        ariaLabel: 'Request URL',
        onInput: (value) => {
            mutate((draft) => {
                draft.snapshot.url = value;
            });
            schedulePersist();
        },
        onEnter: () => options.onSend(),
        onPaste: (event) => {
            const pasted = event.clipboardData?.getData('text');

            if (pasted && applyCurl(pasted)) {
                event.preventDefault();
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
                click: () => (getState().loading ? options.onCancel() : options.onSend()),
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

    watch(
        (state) => state.snapshot.method,
        (method) => {
            methodSelect.setValue(method);
            shell.className = `url-shell method-border-${method.toLowerCase()}`;
        }
    );
    watch(
        (state) => state.snapshot.url,
        (value) => {
            if (urlInput.value !== value) {
                urlInput.value = value;
                url.refresh();
            }
        }
    );
    watch(
        (state) => state.loading,
        (loading) => {
            sendButton.classList.toggle('is-loading', loading);
            sendLabel.textContent = loading ? 'Cancel' : 'Send';
            replace(sendIcon, icon(loading ? 'stop' : 'send'));
        }
    );

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
            const url = getState().snapshot.url.trim();

            if (url) {
                post({ type: 'copy', text: url, label: 'URL' });
            }
        }),
        item('terminal', 'Copy as cURL', () => {
            const snapshot = persistable().snapshot;

            if (!snapshot.url.trim()) {
                return;
            }

            try {
                post({
                    type: 'copy',
                    text: buildCurlCommand(snapshot),
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
