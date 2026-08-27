export type Child = Node | string | null | undefined | false;

interface Props {
    class?: string;
    text?: string;
    html?: string;
    title?: string;
    type?: string;
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    checked?: boolean;
    spellcheck?: boolean;
    rows?: number;
    src?: string;
    alt?: string;
    role?: string;
    tabIndex?: number;
    dataset?: Record<string, string>;
    attrs?: Record<string, string>;
    on?: Partial<{
        [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void;
    }>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Props = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    const { class: className, dataset, attrs, on, html, text, ...rest } = props;

    if (className) {
        node.className = className;
    }

    if (html !== undefined) {
        node.innerHTML = html;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    Object.assign(node, rest);
    if (dataset) {
        Object.assign(node.dataset, dataset);
    }

    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            node.setAttribute(key, value);
        }
    }

    if (on) {
        for (const [event, handler] of Object.entries(on)) {
            node.addEventListener(event, handler as EventListener);
        }
    }

    append(node, children);

    return node;
}

export function append(parent: Node, children: Child[]): void {
    for (const child of children) {
        if (child === null || child === undefined || child === false) {
            continue;
        }

        parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
}

export function clear(node: Node): void {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

export function replace(node: Element, ...children: Child[]): void {
    clear(node);
    append(node, children);
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
