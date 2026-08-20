import { DEFAULT_TIMEOUT_MS } from '../../core/constants';
import { schedulePersist } from '../bridge';
import { el } from '../dom';
import { icon } from '../icons';
import { state } from '../store';

function toggleRow(
    label: string,
    description: string,
    checked: boolean,
    onChange: (value: boolean) => void
): HTMLElement {
    return el(
        'label',
        { class: 'setting-row' },
        el('input', {
            type: 'checkbox',
            checked,
            on: {
                change: (event) => onChange((event.target as HTMLInputElement).checked),
            },
        }),
        el(
            'span',
            { class: 'setting-text' },
            el('span', { class: 'setting-label', text: label }),
            el('span', { class: 'setting-desc', text: description })
        )
    );
}

export function createSettingsMenu(): { root: HTMLElement } {
    const { settings } = state;

    const timeout = el('input', {
        class: 'field',
        type: 'number',
        value: String(settings.timeout),
        attrs: { min: '100', step: '500' },
        on: {
            change: (event) => {
                const parsed = Number((event.target as HTMLInputElement).value);
                settings.timeout =
                    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
                schedulePersist();
            },
        },
    });

    const panel = el(
        'div',
        { class: 'menu-popup settings-popup' },
        el('p', { class: 'settings-title', text: 'Request settings' }),
        toggleRow(
            'Follow redirects',
            'Chase 3xx responses automatically.',
            settings.followRedirects,
            (value) => {
                settings.followRedirects = value;
                schedulePersist();
            }
        ),
        toggleRow(
            'Verify TLS certificates',
            'Turn off to allow self-signed certificates.',
            settings.rejectUnauthorized,
            (value) => {
                settings.rejectUnauthorized = value;
                schedulePersist();
            }
        ),
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

    document.addEventListener('mousedown', (event) => {
        if (!(event.target as HTMLElement | null)?.closest('.settings-menu')) {
            root.classList.remove('is-open');
        }
    });

    return { root };
}
