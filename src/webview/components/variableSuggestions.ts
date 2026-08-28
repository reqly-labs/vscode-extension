import { matchVariables, type Variable } from '../../core/variables';
import { el, replace } from '../dom';
import { state } from '../store';

export interface SuggestionListHandle {
    root: HTMLElement;
    isOpen(): boolean;
    open(query: string): boolean;
    close(): void;
    handleKey(event: KeyboardEvent): boolean;
    moveTo(left: number, top: number): void;
}

let closeOpenList: (() => void) | null = null;

export function createSuggestionList(options: {
    onAccept: (key: string) => void;
}): SuggestionListHandle {
    const list = el('div', { class: 'variable-list', role: 'listbox' });
    const root = el('div', { class: 'variable-popup' }, list);

    let matches: Variable[] = [];
    let activeIndex = 0;

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

    return {
        root,

        isOpen: () => root.classList.contains('is-open'),

        open(query: string) {
            matches = matchVariables(state.environment.variables, query);

            if (matches.length === 0) {
                close();

                return false;
            }

            activeIndex = 0;
            closeOpenList?.();
            closeOpenList = close;
            root.classList.add('is-open');
            render();

            return true;
        },

        close,

        moveTo(left: number, top: number) {
            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
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
