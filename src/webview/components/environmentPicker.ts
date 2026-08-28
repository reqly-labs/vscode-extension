import { post } from '../bridge';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { on, state } from '../store';

export function createEnvironmentPicker(): { root: HTMLElement } {
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
