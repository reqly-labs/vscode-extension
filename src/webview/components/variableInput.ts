import {
    completeVariableToken,
    findActiveVariableToken,
    findVariableTokens,
    matchVariables,
    type ActiveVariableToken,
    type Variable,
} from '../../core/variables';
import { el, replace } from '../dom';
import { state } from '../store';

export interface VariableInputHandle {
    root: HTMLElement;
    input: HTMLInputElement;
    refresh(): void;
    destroy(): void;
}

export interface VariableInputOptions {
    value: string;
    placeholder?: string;
    className?: string;
    ariaLabel: string;
    onInput: (value: string) => void;
    onEnter?: () => void;
    onPaste?: (event: ClipboardEvent) => boolean;
}

let openDropdown: (() => void) | null = null;

function highlight(value: string): Node[] {
    const tokens = findVariableTokens(value);

    if (tokens.length === 0) {
        return [document.createTextNode(value)];
    }

    const parts: Node[] = [];
    let cursor = 0;

    for (const token of tokens) {
        if (token.start > cursor) {
            parts.push(document.createTextNode(value.slice(cursor, token.start)));
        }

        parts.push(el('span', { class: 'variable-token', text: token.text }));
        cursor = token.end;
    }

    if (cursor < value.length) {
        parts.push(document.createTextNode(value.slice(cursor)));
    }

    return parts;
}

export function createVariableInput(options: VariableInputOptions): VariableInputHandle {
    const backdrop = el('div', { class: 'variable-backdrop', attrs: { 'aria-hidden': 'true' } });
    const list = el('div', { class: 'variable-list', role: 'listbox' });
    const popup = el('div', { class: 'variable-popup' }, list);
    const input = el('input', {
        class: `variable-field ${options.className ?? ''}`.trim(),
        value: options.value,
        spellcheck: false,
        placeholder: options.placeholder ?? '',
        attrs: { 'aria-label': options.ariaLabel, autocomplete: 'off', role: 'combobox' },
    });
    const root = el('div', { class: 'variable-input' }, backdrop, input, popup);

    let token: ActiveVariableToken | null = null;
    let matches: Variable[] = [];
    let activeIndex = 0;

    const paint = () => {
        replace(backdrop, ...highlight(input.value));
        backdrop.scrollLeft = input.scrollLeft;
    };

    const close = () => {
        token = null;
        matches = [];
        root.classList.remove('is-open');

        if (openDropdown === close) {
            openDropdown = null;
        }
    };

    const renderMatches = () => {
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
                                renderMatches();
                            },
                            click: () => accept(variable.key),
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

    const sync = () => {
        const caret = input.selectionStart ?? input.value.length;

        token = findActiveVariableToken(input.value, caret);
        matches = token ? matchVariables(state.environment.variables, token.query) : [];

        if (!token || matches.length === 0) {
            close();

            return;
        }

        activeIndex = 0;
        openDropdown?.();
        openDropdown = close;
        root.classList.add('is-open');
        renderMatches();
    };

    const accept = (key: string) => {
        if (!token) {
            return;
        }

        const { text, caret } = completeVariableToken(input.value, token, key);

        input.value = text;
        options.onInput(text);
        paint();
        close();
        input.focus();
        input.setSelectionRange(caret, caret);
    };

    input.addEventListener('input', () => {
        options.onInput(input.value);
        paint();
        sync();
    });
    input.addEventListener('scroll', () => (backdrop.scrollLeft = input.scrollLeft));
    input.addEventListener('click', sync);
    input.addEventListener('focus', sync);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (event) => {
        if (root.classList.contains('is-open') && matches.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                activeIndex = (activeIndex + 1) % matches.length;
                renderMatches();

                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                activeIndex = (activeIndex - 1 + matches.length) % matches.length;
                renderMatches();

                return;
            }

            if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                accept(matches[activeIndex].key);

                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                close();

                return;
            }
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            options.onEnter?.();
        }
    });

    if (options.onPaste) {
        input.addEventListener('paste', (event) => {
            if (options.onPaste?.(event)) {
                paint();
            }
        });
    }

    paint();

    return { root, input, refresh: paint, destroy: close };
}
