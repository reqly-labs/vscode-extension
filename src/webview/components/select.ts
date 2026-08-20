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
    /** Removes the portaled popup. Required for selects recreated on every render. */
    destroy(): void;
}

let openPopup: (() => void) | null = null;

function isInsideSelect(target: EventTarget | null): boolean {
    return Boolean((target as HTMLElement | null)?.closest('.select, .select-popup'));
}

document.addEventListener('mousedown', (event) => {
    if (!isInsideSelect(event.target)) {
        openPopup?.();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        openPopup?.();
    }
});

// Capturing phase, so scrolling *any* inner pane (params, headers, form
// fields...) closes an open popup instead of leaving it stranded away from
// its trigger — `scroll` does not bubble, so a non-capturing listener would
// only ever see scrolls on `document` itself.
document.addEventListener(
    'scroll',
    () => {
        openPopup?.();
    },
    true
);

window.addEventListener('resize', () => {
    openPopup?.();
});

function positionPopup(popup: HTMLElement, trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();

    popup.style.minWidth = `${rect.width}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.left = `${rect.left}px`;

    requestAnimationFrame(() => {
        const overflow = rect.left + popup.offsetWidth - window.innerWidth + 8;

        if (overflow > 0) {
            popup.style.left = `${Math.max(8, rect.left - overflow)}px`;
        }
    });
}

export function createSelect<T extends string>(options: {
    value: T;
    items: SelectOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    ariaLabel: string;
}): SelectHandle<T> {
    let current = options.value;
    const extraClass = options.className ?? '';

    const label = el('span', { class: 'select-label' });
    const list = el('div', { class: 'select-list', role: 'listbox' });

    /*
     * Several triggers (the method selector, the body-type selector...) sit
     * inside an ancestor with `overflow: hidden`/`auto` for rounded corners
     * or scrolling. `position: fixed` alone does not escape that clipping in
     * real browsers unless the element is also moved out of that ancestor's
     * subtree — so the popup is portaled onto `document.body` and positioned
     * from the trigger's bounding rect instead of living inside `.select`.
     */
    const popup = el('div', { class: `select-popup ${extraClass}`.trim() }, list);
    document.body.appendChild(popup);

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

    const root = el('div', { class: `select ${extraClass}`.trim() }, trigger);

    const paint = () => {
        const item = options.items.find((entry) => entry.value === current);
        replace(label, el('span', { class: item?.className ?? '', text: item?.label ?? current }));

        list.querySelectorAll('.select-item').forEach((node) => {
            node.classList.toggle('is-selected', (node as HTMLElement).dataset.value === current);
        });
    };

    const close = () => {
        root.classList.remove('is-open');
        popup.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');

        if (openPopup === close) {
            openPopup = null;
        }
    };

    const toggle = () => {
        if (popup.classList.contains('is-open')) {
            close();
            return;
        }

        openPopup?.();
        positionPopup(popup, trigger);
        root.classList.add('is-open');
        popup.classList.add('is-open');
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
        destroy() {
            close();
            popup.remove();
        },
    };
}
