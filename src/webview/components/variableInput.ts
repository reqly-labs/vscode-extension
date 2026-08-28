import {
    completeVariableToken,
    findActiveVariableToken,
    findVariableTokens,
    type ActiveVariableToken,
} from '../../core/variables';
import { el, replace } from '../dom';
import { createSuggestionList } from './variableSuggestions';

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

export function highlightTokens(value: string): Node[] {
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
    const input = el('input', {
        class: `variable-field ${options.className ?? ''}`.trim(),
        value: options.value,
        spellcheck: false,
        placeholder: options.placeholder ?? '',
        attrs: { 'aria-label': options.ariaLabel, autocomplete: 'off', role: 'combobox' },
    });

    let token: ActiveVariableToken | null = null;

    const paint = () => {
        replace(backdrop, ...highlightTokens(input.value));
        backdrop.scrollLeft = input.scrollLeft;
    };

    const suggestions = createSuggestionList({
        onAccept: (key) => {
            if (!token) {
                return;
            }

            const { text, caret } = completeVariableToken(input.value, token, key);

            input.value = text;
            options.onInput(text);
            paint();
            token = null;
            root.classList.remove('is-open');
            input.focus();
            input.setSelectionRange(caret, caret);
        },
    });
    const root = el('div', { class: 'variable-input' }, backdrop, input, suggestions.root);

    const sync = () => {
        const caret = input.selectionStart ?? input.value.length;

        token = findActiveVariableToken(input.value, caret);
        root.classList.toggle('is-open', token !== null && suggestions.open(token.query));
    };

    const close = () => {
        token = null;
        suggestions.close();
        root.classList.remove('is-open');
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
        if (suggestions.handleKey(event)) {
            root.classList.toggle('is-open', suggestions.isOpen());

            return;
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
