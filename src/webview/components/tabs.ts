import { el } from '../dom';

export interface TabItem {
    id: string;
    label: string;
}

export interface TabsHandle {
    root: HTMLElement;
    setActive(id: string): void;
    setBadge(id: string, badge: string | null): void;
    setDot(id: string, visible: boolean): void;
}

export function createTabs(options: {
    items: TabItem[];
    active: string;
    onChange: (id: string) => void;
}): TabsHandle {
    const buttons = new Map<
        string,
        {
            button: HTMLButtonElement;
            badge: HTMLElement;
            dot: HTMLElement;
        }
    >();
    const root = el('div', { class: 'tabs', role: 'tablist' });

    for (const item of options.items) {
        const badge = el('span', { class: 'tab-badge is-hidden' });
        const dot = el('span', { class: 'tab-dot is-hidden' });
        const button = el(
            'button',
            {
                class: 'tab',
                type: 'button',
                role: 'tab',
                dataset: { id: item.id },
                on: { click: () => setActive(item.id, true) },
            },
            el('span', { text: item.label }),
            badge,
            dot
        );

        buttons.set(item.id, { button, badge, dot });
        root.appendChild(button);
    }

    function setActive(id: string, notify = false): void {
        for (const [key, entry] of buttons) {
            const active = key === id;

            entry.button.classList.toggle('is-active', active);
            entry.button.setAttribute('aria-selected', String(active));
        }

        if (notify) {
            options.onChange(id);
        }
    }

    setActive(options.active);

    return {
        root,
        setActive: (id: string) => setActive(id),
        setBadge(id, badge) {
            const entry = buttons.get(id);

            if (!entry) {
                return;
            }

            entry.badge.textContent = badge ?? '';
            entry.badge.classList.toggle('is-hidden', !badge);
        },
        setDot(id, visible) {
            buttons.get(id)?.dot.classList.toggle('is-hidden', !visible);
        },
    };
}
