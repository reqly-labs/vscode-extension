import { el, replace } from '../dom';
import { icon } from '../icons';

export interface SelectOption<T extends string> {
    value: T;
    label: string;
    /** Extra class applied to the label, used for method colouring. */
    className?: string;
}

export interface SelectHandle<T extends string> {
    root: HTMLElement;
    setValue(value: T): void;
}

let openPopup: (() => void) | null = null;

document.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement | null;

    if (!target?.closest('.select')) {
        openPopup?.();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        openPopup?.();
    }
});

export function createSelect<T extends string>(options: {
    value: T;
    items: SelectOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    ariaLabel: string;
}): SelectHandle<T> {
    let current = options.value;

    const label = el('span', { class: 'select-label' });
    const list = el('div', { class: 'select-list', role: 'listbox' });
    const popup = el('div', { class: 'select-popup' }, list);

    const trigger = el(
        'button',
        {
            class: 'select-trigger',
            type: 'button',
            attrs: { 'aria-label': options.ariaLabel, 'aria-haspopup': 'listbox' },
            on: { click: () => toggle() },
        },
        label,
        icon('chevronDown', 'select-caret')
    );

    const root = el('div', { class: `select ${options.className ?? ''}`.trim() }, trigger, popup);

    const paint = () => {
        const item = options.items.find((entry) => entry.value === current);
        replace(label, el('span', { class: item?.className ?? '', text: item?.label ?? current }));

        list.querySelectorAll('.select-item').forEach((node) => {
            node.classList.toggle('is-selected', (node as HTMLElement).dataset.value === current);
        });
    };

    const close = () => {
        root.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        openPopup = null;
    };

    const toggle = () => {
        if (root.classList.contains('is-open')) {
            close();
            return;
        }

        openPopup?.();
        root.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        openPopup = close;
    };

    for (const item of options.items) {
        list.appendChild(
            el(
                'button',
                {
                    class: 'select-item',
                    type: 'button',
                    role: 'option',
                    dataset: { value: item.value },
                    on: {
                        click: () => {
                            close();

                            if (item.value !== current) {
                                current = item.value;
                                paint();
                                options.onChange(item.value);
                            }
                        },
                    },
                },
                el('span', { class: item.className ?? '', text: item.label })
            )
        );
    }

    paint();

    return {
        root,
        setValue(value: T) {
            current = value;
            paint();
        },
    };
}
