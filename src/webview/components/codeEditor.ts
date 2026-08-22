import { el } from '../dom';
import { highlight, type Language } from '../highlight';
const OPEN_TO_CLOSE: Record<string, string> = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'" };
const OPENERS = new Set(Object.keys(OPEN_TO_CLOSE));
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));
const INDENT_UNIT = '  ';
function currentLineIndent(before: string): string {
    const lineStart = before.lastIndexOf('\n') + 1;
    return /^[ \t]*/.exec(before.slice(lineStart))?.[0] ?? '';
}
function handleSmartTyping(input: HTMLTextAreaElement, event: KeyboardEvent): boolean {
    const { selectionStart, selectionEnd, value } = input;
    const hasSelection = selectionStart !== selectionEnd;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    if (event.key === 'Enter') {
        const indent = currentLineIndent(before);
        const prevChar = before.at(-1);
        const nextChar = after.at(0);
        if (prevChar && OPENERS.has(prevChar) && OPEN_TO_CLOSE[prevChar] === nextChar) {
            const innerIndent = indent + INDENT_UNIT;
            const insert = `\n${innerIndent}\n${indent}`;
            input.value = before + insert + after;
            const cursor = before.length + 1 + innerIndent.length;
            input.selectionStart = input.selectionEnd = cursor;
            return true;
        }
        const nextIndent = prevChar && OPENERS.has(prevChar) ? indent + INDENT_UNIT : indent;
        const insert = `\n${nextIndent}`;
        input.value = before + insert + after;
        input.selectionStart = input.selectionEnd = before.length + insert.length;
        return true;
    }
    if (event.key === 'Backspace' && !hasSelection) {
        const prevChar = before.at(-1);
        const nextChar = after.at(0);
        if (prevChar && OPENERS.has(prevChar) && OPEN_TO_CLOSE[prevChar] === nextChar) {
            input.value = before.slice(0, -1) + after.slice(1);
            input.selectionStart = input.selectionEnd = before.length - 1;
            return true;
        }
        return false;
    }
    const isQuote = event.key === '"' || event.key === "'";
    if (isQuote && !hasSelection && after.at(0) === event.key) {
        input.selectionStart = input.selectionEnd = selectionEnd + 1;
        return true;
    }
    if (OPENERS.has(event.key)) {
        const close = OPEN_TO_CLOSE[event.key];
        if (hasSelection) {
            const selected = value.slice(selectionStart, selectionEnd);
            input.value = before + event.key + selected + close + after;
            input.selectionStart = selectionStart + 1;
            input.selectionEnd = selectionEnd + 1;
        } else {
            input.value = before + event.key + close + after;
            input.selectionStart = input.selectionEnd = before.length + 1;
        }
        return true;
    }
    if (CLOSERS.has(event.key) && !hasSelection && after.at(0) === event.key) {
        input.selectionStart = input.selectionEnd = selectionEnd + 1;
        return true;
    }
    return false;
}
function gutterFor(lineCount: number): string {
    let text = '';
    for (let line = 1; line <= lineCount; line += 1) {
        text += `${line}\n`;
    }
    return text;
}
function countLines(value: string): number {
    let lines = 1;
    for (let i = 0; i < value.length; i += 1) {
        if (value[i] === '\n') {
            lines += 1;
        }
    }
    return lines;
}
export interface EditorHandle {
    root: HTMLElement;
    setValue(value: string): void;
    setLanguage(language: Language): void;
    getValue(): string;
    focus(): void;
}
export function createEditor(options: {
    value: string;
    language: Language;
    onChange: (value: string) => void;
    placeholder?: string;
}): EditorHandle {
    let language = options.language;
    const gutter = el('div', { class: 'code-gutter' });
    const layer = el('pre', { class: 'code-layer' });
    const input = el('textarea', {
        class: 'code-input',
        spellcheck: false,
        value: options.value,
        placeholder: options.placeholder ?? '',
        attrs: { autocapitalize: 'off', autocorrect: 'off', wrap: 'off' },
    });
    const scroller = el('div', { class: 'code-scroll' }, layer, input);
    const root = el('div', { class: 'code-editor' }, gutter, scroller);
    const paint = () => {
        const value = input.value;
        gutter.textContent = gutterFor(countLines(value));
        layer.innerHTML = `${highlight(value, language)}\n`;
    };
    input.addEventListener('input', () => {
        paint();
        options.onChange(input.value);
    });
    input.addEventListener('scroll', () => {
        layer.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
        gutter.scrollTop = input.scrollTop;
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            const { selectionStart, selectionEnd, value } = input;
            input.value = `${value.slice(0, selectionStart)}${INDENT_UNIT}${value.slice(selectionEnd)}`;
            input.selectionStart = input.selectionEnd = selectionStart + INDENT_UNIT.length;
            paint();
            options.onChange(input.value);
            return;
        }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && handleSmartTyping(input, event)) {
            event.preventDefault();
            paint();
            options.onChange(input.value);
        }
    });
    paint();
    return {
        root,
        setValue(value: string) {
            if (input.value !== value) {
                input.value = value;
                paint();
            }
        },
        setLanguage(next: Language) {
            language = next;
            paint();
        },
        getValue: () => input.value,
        focus: () => input.focus(),
    };
}
export interface ViewerHandle {
    root: HTMLElement;
    setContent(value: string, language: Language): void;
    setWrap(wrap: boolean): void;
}
export function createViewer(wrap: boolean): ViewerHandle {
    const gutter = el('div', { class: 'code-gutter' });
    const layer = el('pre', { class: 'code-layer is-readonly' });
    const scroller = el('div', { class: 'code-scroll' }, layer);
    const root = el('div', { class: 'code-editor is-readonly' }, gutter, scroller);
    scroller.addEventListener('scroll', () => {
        gutter.scrollTop = scroller.scrollTop;
    });
    const applyWrap = (enabled: boolean) => {
        root.classList.toggle('is-wrapped', enabled);
    };
    applyWrap(wrap);
    return {
        root,
        setContent(value: string, language: Language) {
            gutter.textContent = gutterFor(countLines(value));
            layer.innerHTML = highlight(value, language);
        },
        setWrap: applyWrap,
    };
}
