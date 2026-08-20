import { el } from '../dom';
import { highlight, type Language } from '../highlight';

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
        if (event.key !== 'Tab' || event.shiftKey) {
            return;
        }

        event.preventDefault();

        const { selectionStart, selectionEnd, value } = input;
        input.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        input.selectionStart = input.selectionEnd = selectionStart + 2;

        paint();
        options.onChange(input.value);
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
