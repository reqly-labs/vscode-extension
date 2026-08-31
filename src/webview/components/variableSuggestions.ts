import { matchVariables, type Variable } from '../../core/variables';
import { el, replace } from '../dom';
import { getState } from '../store';

export interface SuggestionAnchor {
    left: number;
    top: number;
    bottom: number;
    width: number;
}

export interface SuggestionListHandle {
    root: HTMLElement;
    isOpen(): boolean;
    openAt(anchor: SuggestionAnchor, query: string): boolean;
    close(): void;
    handleKey(event: KeyboardEvent): boolean;
    destroy(): void;
}

const MIN_WIDTH = 240;

const MAX_WIDTH = 420;

const MAX_HEIGHT = 220;

interface Overlay {
    root: HTMLElement;
    list: HTMLElement;
}

let overlay: Overlay | null = null;

let owner: object | null = null;

let accept: ((key: string) => void) | null = null;

let matches: Variable[] = [];

let activeIndex = 0;

export function knownVariableNames(): Set<string> {
    const names = new Set(
        scopedVariables()
            .filter((variable) => variable.enabled && variable.key.trim())
            .map((variable) => variable.key.trim())
    );

    for (const entry of getState().environment.dynamic) {
        names.add(entry.name);
    }

    return names;
}

function scopedVariables(): Variable[] {
    const { activeId, environments, collection } = getState().environment;
    const fromEnvironment = environments.find((entry) => entry.id === activeId)?.variables ?? [];
    const chosen = new Map<string, Variable>();

    for (const variable of [...(collection?.variables ?? []), ...fromEnvironment]) {
        const key = variable.key.trim();

        if (variable.enabled && key) {
            chosen.set(key, { ...variable });
        }
    }

    return [...chosen.values()];
}

function dynamicAsVariables(): Variable[] {
    return getState().environment.dynamic.map((entry) => ({
        id: entry.name,
        key: entry.name,
        value: entry.description,
        enabled: true,
        secret: false,
    }));
}

function mount(): Overlay {
    if (overlay && overlay.root.ownerDocument === document) {
        return overlay;
    }

    const list = el('div', { class: 'variable-list', role: 'listbox' });

    overlay = { root: el('div', { class: 'variable-popup' }, list), list };
    document.body.appendChild(overlay.root);

    return overlay;
}

function render(): void {
    const { list } = mount();

    replace(
        list,
        ...matches.map((variable, index) =>
            el(
                'button',
                {
                    class: `variable-option${index === activeIndex ? ' is-active' : ''}`,
                    type: 'button',
                    role: 'option',
                    title: variable.secret ? variable.key : `${variable.key} · ${variable.value}`,
                    attrs: { 'aria-selected': index === activeIndex ? 'true' : 'false' },
                    on: {
                        mousedown: (event) => event.preventDefault(),
                        mouseenter: () => {
                            activeIndex = index;
                            render();
                        },
                        click: () => choose(index),
                    },
                },
                el('span', { class: 'variable-option-key', text: variable.key }),
                el('span', {
                    class: 'variable-option-value',
                    text: variable.secret ? '••••••' : variable.value || '(empty)',
                })
            )
        )
    );

    const active = list.querySelector('.variable-option.is-active');

    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
    }
}

function place(anchor: SuggestionAnchor): void {
    const { root } = mount();
    const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, anchor.width));
    const viewportWidth = window.innerWidth || width;
    const viewportHeight = window.innerHeight || anchor.bottom + MAX_HEIGHT;
    const left = Math.max(8, Math.min(anchor.left, viewportWidth - width - 8));
    const below = viewportHeight - anchor.bottom;
    const flip = below < MAX_HEIGHT + 16 && anchor.top > below;

    root.style.width = `${width}px`;
    root.style.left = `${left}px`;
    if (flip) {
        root.style.top = 'auto';
        root.style.bottom = `${viewportHeight - anchor.top + 4}px`;
    } else {
        root.style.bottom = 'auto';
        root.style.top = `${anchor.bottom + 4}px`;
    }
}

function dismiss(): void {
    matches = [];
    activeIndex = 0;
    owner = null;
    accept = null;
    if (overlay) {
        overlay.root.classList.remove('is-open');
        replace(overlay.list);
    }
}

function choose(index: number): void {
    const key = matches[index]?.key;
    const onAccept = accept;

    dismiss();
    if (key !== undefined) {
        onAccept?.(key);
    }
}

function isShowing(): boolean {
    return overlay !== null && overlay.root.classList.contains('is-open');
}

export function createSuggestionList(options: {
    onAccept: (key: string) => void;
}): SuggestionListHandle {
    const token = {};
    const owns = () => owner === token;

    mount();

    return {
        get root() {
            return mount().root;
        },

        isOpen: () => owns() && isShowing(),

        openAt(anchor: SuggestionAnchor, query: string) {
            const found = matchVariables([...scopedVariables(), ...dynamicAsVariables()], query);

            if (found.length === 0) {
                if (owns()) {
                    dismiss();
                }

                return false;
            }

            owner = token;
            accept = options.onAccept;
            matches = found;
            activeIndex = 0;
            mount().root.classList.add('is-open');
            place(anchor);
            render();

            return true;
        },

        close() {
            if (owns()) {
                dismiss();
            }
        },

        destroy() {
            if (owns()) {
                dismiss();
            }
        },

        handleKey(event: KeyboardEvent) {
            if (!owns() || !isShowing() || matches.length === 0) {
                return false;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                activeIndex = (activeIndex + 1) % matches.length;
                render();

                return true;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                activeIndex = (activeIndex - 1 + matches.length) % matches.length;
                render();

                return true;
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                choose(activeIndex);

                return true;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();

                return true;
            }

            return false;
        },
    };
}
