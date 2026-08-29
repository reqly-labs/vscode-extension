import { matchVariables, type Variable } from '../../core/variables';
import { el, replace } from '../dom';
import { state } from '../store';

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

let closeOpenList: (() => void) | null = null;

export function knownVariableNames(): Set<string> {
    const names = new Set(
        scopedVariables()
            .filter((variable) => variable.enabled && variable.key.trim())
            .map((variable) => variable.key.trim())
    );

    for (const entry of state.environment.dynamic) {
        names.add(entry.name);
    }

    return names;
}

function scopedVariables(): Variable[] {
    const { activeId, environments, collection } = state.environment;
    const fromEnvironment = environments.find((entry) => entry.id === activeId)?.variables ?? [];
    const chosen = new Map<string, Variable>();

    for (const variable of [...(collection?.variables ?? []), ...fromEnvironment]) {
        const key = variable.key.trim();

        if (variable.enabled && key) {
            chosen.set(key, variable);
        }
    }

    return [...chosen.values()];
}

function dynamicAsVariables(): Variable[] {
    return state.environment.dynamic.map((entry) => ({
        id: entry.name,
        key: entry.name,
        value: entry.description,
        enabled: true,
        secret: false,
    }));
}

export function createSuggestionList(options: {
    onAccept: (key: string) => void;
}): SuggestionListHandle {
    const list = el('div', { class: 'variable-list', role: 'listbox' });
    const root = el('div', { class: 'variable-popup' }, list);

    let matches: Variable[] = [];
    let activeIndex = 0;

    document.body.appendChild(root);

    const close = () => {
        matches = [];
        root.classList.remove('is-open');

        if (closeOpenList === close) {
            closeOpenList = null;
        }
    };

    const render = () => {
        replace(
            list,
            ...matches.map((variable, index) =>
                el(
                    'button',
                    {
                        class: `variable-option${index === activeIndex ? ' is-active' : ''}`,
                        type: 'button',
                        role: 'option',
                        title: variable.secret
                            ? variable.key
                            : `${variable.key} · ${variable.value}`,
                        attrs: { 'aria-selected': index === activeIndex ? 'true' : 'false' },
                        on: {
                            mousedown: (event) => event.preventDefault(),
                            mouseenter: () => {
                                activeIndex = index;
                                render();
                            },
                            click: () => {
                                const key = variable.key;

                                close();
                                options.onAccept(key);
                            },
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
    };

    const place = (anchor: SuggestionAnchor) => {
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
    };

    return {
        root,

        isOpen: () => root.classList.contains('is-open'),

        openAt(anchor: SuggestionAnchor, query: string) {
            matches = matchVariables([...scopedVariables(), ...dynamicAsVariables()], query);

            if (matches.length === 0) {
                close();

                return false;
            }

            activeIndex = 0;
            closeOpenList?.();
            closeOpenList = close;
            root.classList.add('is-open');
            place(anchor);
            render();

            return true;
        },

        close,

        destroy() {
            close();
            root.remove();
        },

        handleKey(event: KeyboardEvent) {
            if (!root.classList.contains('is-open') || matches.length === 0) {
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

                const key = matches[activeIndex].key;

                close();
                options.onAccept(key);

                return true;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                close();

                return true;
            }

            return false;
        },
    };
}
