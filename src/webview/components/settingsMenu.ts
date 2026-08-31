import {
    DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_TIMEOUT_MS,
    MIN_MAX_RESPONSE_BYTES,
} from '../../core/constants';
import { schedulePersist } from '../bridge';
import { el } from '../dom';
import { icon } from '../icons';
import { getState, mutate, watch } from '../store';

function toggleRow(
    label: string,
    description: string,
    checked: boolean,
    onChange: (value: boolean) => void
): { root: HTMLElement; input: HTMLInputElement } {
    const input = el('input', {
        type: 'checkbox',
        checked,
        on: {
            change: (event) => onChange((event.target as HTMLInputElement).checked),
        },
    });
    const root = el(
        'label',
        { class: 'setting-row' },
        input,
        el(
            'span',
            { class: 'setting-text' },
            el('span', { class: 'setting-label', text: label }),
            el('span', { class: 'setting-desc', text: description })
        )
    );

    return { root, input };
}

const MEGABYTE = 1024 * 1024;

function toMegabytes(bytes: number): string {
    return String(Math.max(1, Math.round(bytes / MEGABYTE)));
}

export function createSettingsMenu(): {
    root: HTMLElement;
} {
    const timeout = el('input', {
        class: 'field',
        type: 'number',
        value: String(getState().settings.timeout),
        attrs: { min: '100', step: '500' },
        on: {
            change: (event) => {
                const parsed = Number((event.target as HTMLInputElement).value);

                mutate((draft) => {
                    draft.settings.timeout =
                        Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
                });
                schedulePersist();
            },
        },
    });
    const maxResponseSize = el('input', {
        class: 'field',
        type: 'number',
        value: toMegabytes(getState().settings.maxResponseSize),
        attrs: { min: '1', step: '10' },
        on: {
            change: (event) => {
                const parsed = Number((event.target as HTMLInputElement).value) * MEGABYTE;

                mutate((draft) => {
                    draft.settings.maxResponseSize =
                        Number.isFinite(parsed) && parsed >= MIN_MAX_RESPONSE_BYTES
                            ? parsed
                            : DEFAULT_MAX_RESPONSE_BYTES;
                });
                schedulePersist();
            },
        },
    });

    const redirects = toggleRow(
        'Follow redirects',
        'Chase 3xx responses automatically.',
        getState().settings.followRedirects,
        (value) => {
            mutate((draft) => {
                draft.settings.followRedirects = value;
            });
            schedulePersist();
        }
    );
    const tls = toggleRow(
        'Verify TLS certificates',
        'Turn off to allow self-signed certificates.',
        getState().settings.rejectUnauthorized,
        (value) => {
            mutate((draft) => {
                draft.settings.rejectUnauthorized = value;
            });
            schedulePersist();
        }
    );
    const panel = el(
        'div',
        { class: 'menu-popup settings-popup' },
        el('p', { class: 'settings-title', text: 'Request settings' }),
        redirects.root,
        tls.root,
        el(
            'label',
            { class: 'setting-row is-inline' },
            el(
                'span',
                { class: 'setting-text' },
                el('span', { class: 'setting-label', text: 'Timeout' }),
                el('span', { class: 'setting-desc', text: 'Milliseconds before aborting.' })
            ),
            timeout
        ),
        el(
            'label',
            { class: 'setting-row is-inline' },
            el(
                'span',
                { class: 'setting-text' },
                el('span', { class: 'setting-label', text: 'Max response size' }),
                el('span', { class: 'setting-desc', text: 'Megabytes kept in memory.' })
            ),
            maxResponseSize
        )
    );
    const trigger = el(
        'button',
        {
            class: 'icon-btn settings-trigger',
            type: 'button',
            title: 'Request settings',
            attrs: { 'aria-label': 'Request settings' },
            on: {
                click: (event) => {
                    event.stopPropagation();
                    root.classList.toggle('is-open');
                },
            },
        },
        icon('settings')
    );
    const root = el('div', { class: 'menu settings-menu' }, trigger, panel);

    watch(
        (state) => state.settings,
        (settings) => {
            timeout.value = String(settings.timeout);
            maxResponseSize.value = toMegabytes(settings.maxResponseSize);
            redirects.input.checked = settings.followRedirects;
            tls.input.checked = settings.rejectUnauthorized;
        }
    );
    document.addEventListener('mousedown', (event) => {
        if (!(event.target as HTMLElement | null)?.closest('.settings-menu')) {
            root.classList.remove('is-open');
        }
    });

    return { root };
}
