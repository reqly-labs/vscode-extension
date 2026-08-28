import type {
    EnvironmentHostMessage,
    EnvironmentRow,
    EnvironmentView,
    EnvironmentViewMessage,
} from '../core/environmentMessages';
import { emptyVariable, type Variable } from '../core/variables';
import './styles.css';

interface VsCodeApi {
    postMessage(message: EnvironmentViewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const root = document.getElementById('root') as HTMLElement;

let view: EnvironmentView = { rows: [], selectedId: null, variables: [] };

function post(message: EnvironmentViewMessage): void {
    vscode.postMessage(message);
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Record<string, unknown> = {},
    ...children: (Node | string | false | null | undefined)[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    const {
        class: className,
        text,
        title,
        on,
        attrs,
        ...rest
    } = props as {
        class?: string;
        text?: string;
        title?: string;
        on?: Record<string, (event: Event) => void>;
        attrs?: Record<string, string>;
    };

    if (className) {
        node.className = className;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    if (title !== undefined) {
        node.title = title;
    }

    Object.assign(node, rest);

    for (const [key, value] of Object.entries(attrs ?? {})) {
        node.setAttribute(key, value);
    }

    for (const [event, handler] of Object.entries(on ?? {})) {
        node.addEventListener(event, handler);
    }

    for (const child of children) {
        if (child === null || child === undefined || child === false) {
            continue;
        }

        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }

    return node;
}

function saveVariables(variables: Variable[]): void {
    if (view.selectedId) {
        view.variables = variables;
        post({ type: 'saveVariables', id: view.selectedId, variables });
    }
}

function environmentRow(row: EnvironmentRow): HTMLElement {
    return el(
        'div',
        {
            class: `env-row${row.id === view.selectedId ? ' is-selected' : ''}${row.active ? ' is-active' : ''}`,
            on: { click: () => post({ type: 'select', id: row.id }) },
        },
        el(
            'button',
            {
                class: `env-dot${row.active ? ' is-on' : ''}`,
                type: 'button',
                title: row.active ? 'Active environment' : 'Use this environment',
                attrs: { 'aria-label': row.active ? 'Active environment' : 'Use this environment' },
                on: {
                    click: (event: Event) => {
                        event.stopPropagation();
                        post({ type: 'activate', id: row.active ? null : row.id });
                    },
                },
            },
            ''
        ),
        el(
            'div',
            { class: 'env-text' },
            el('span', { class: 'env-name', text: row.name }),
            el('span', {
                class: 'env-count',
                text: `${row.variableCount} variable${row.variableCount === 1 ? '' : 's'}`,
            })
        ),
        el(
            'div',
            { class: 'env-actions' },
            iconButton('Rename', () => post({ type: 'rename', id: row.id, name: row.name })),
            iconButton('Duplicate', () => post({ type: 'duplicate', id: row.id })),
            iconButton('Delete', () => post({ type: 'remove', id: row.id }), 'is-danger')
        )
    );
}

function iconButton(label: string, onClick: () => void, extra = ''): HTMLElement {
    return el('button', {
        class: `env-action ${extra}`.trim(),
        type: 'button',
        title: label,
        text: label,
        attrs: { 'aria-label': label },
        on: {
            click: (event: Event) => {
                event.stopPropagation();
                onClick();
            },
        },
    });
}

function variableRow(variable: Variable, index: number): HTMLElement {
    const update = (patch: Partial<Variable>) => {
        const next = view.variables.map((entry, position) =>
            position === index ? { ...entry, ...patch } : entry
        );

        saveVariables(next);
    };

    const enabled = el('input', {
        class: 'var-check',
        type: 'checkbox',
        checked: variable.enabled,
        attrs: { 'aria-label': 'Enable variable' },
        on: {
            change: (event: Event) =>
                update({ enabled: (event.target as HTMLInputElement).checked }),
        },
    });

    const key = el('input', {
        class: 'field var-key',
        value: variable.key,
        placeholder: 'Variable name',
        spellcheck: false,
        attrs: { 'aria-label': 'Variable name' },
        on: {
            change: (event: Event) => update({ key: (event.target as HTMLInputElement).value }),
        },
    });

    const value = el('input', {
        class: 'field var-value',
        value: variable.value,
        placeholder: variable.secret ? 'Stored in the keychain' : 'Value',
        spellcheck: false,
        type: variable.secret ? 'password' : 'text',
        attrs: { 'aria-label': 'Variable value' },
        on: {
            change: (event: Event) => update({ value: (event.target as HTMLInputElement).value }),
        },
    });

    const secret = el(
        'label',
        { class: 'var-secret', title: 'Keep this value in the operating system keychain' },
        el('input', {
            type: 'checkbox',
            checked: variable.secret,
            attrs: { 'aria-label': 'Secret variable' },
            on: {
                change: (event: Event) =>
                    update({ secret: (event.target as HTMLInputElement).checked }),
            },
        }),
        el('span', { text: 'Secret' })
    );

    return el(
        'div',
        { class: `var-row${variable.enabled ? '' : ' is-disabled'}` },
        enabled,
        key,
        value,
        secret,
        iconButton(
            'Remove',
            () => saveVariables(view.variables.filter((_, position) => position !== index)),
            'is-danger'
        )
    );
}

function render(): void {
    root.textContent = '';

    const selected = view.rows.find((row) => row.id === view.selectedId);
    const sidebar = el(
        'aside',
        { class: 'env-sidebar' },
        el(
            'header',
            { class: 'env-sidebar-head' },
            el('span', { class: 'env-title', text: 'Environments' }),
            el('button', {
                class: 'env-add',
                type: 'button',
                text: 'New',
                title: 'New environment',
                on: { click: () => post({ type: 'create' }) },
            })
        ),
        el(
            'div',
            { class: 'env-list' },
            ...(view.rows.length > 0
                ? view.rows.map(environmentRow)
                : [el('p', { class: 'env-empty', text: 'No environments yet.' })])
        )
    );

    const body = selected
        ? el(
              'section',
              { class: 'env-detail' },
              el(
                  'header',
                  { class: 'env-detail-head' },
                  el('h1', { class: 'env-detail-title', text: selected.name }),
                  selected.active
                      ? el('span', { class: 'env-badge', text: 'Active' })
                      : el('button', {
                            class: 'env-use',
                            type: 'button',
                            text: 'Use this environment',
                            on: { click: () => post({ type: 'activate', id: selected.id }) },
                        })
              ),
              el(
                  'p',
                  { class: 'env-hint' },
                  'Reference a variable anywhere in a request by typing ',
                  el('code', { text: '{{name}}' }),
                  '. Secret values are kept in the operating system keychain, never in the file.'
              ),
              el(
                  'div',
                  { class: 'var-table' },
                  ...(view.variables.length > 0
                      ? view.variables.map(variableRow)
                      : [el('p', { class: 'env-empty', text: 'No variables yet.' })])
              ),
              el('button', {
                  class: 'env-add-var',
                  type: 'button',
                  text: 'Add variable',
                  on: { click: () => saveVariables([...view.variables, emptyVariable()]) },
              })
          )
        : el(
              'section',
              { class: 'env-detail is-empty' },
              el('p', {
                  class: 'env-empty',
                  text: 'Create an environment to keep the values a request needs.',
              })
          );

    root.appendChild(el('div', { class: 'env-shell' }, sidebar, body));
}

window.addEventListener('message', (event: MessageEvent<EnvironmentHostMessage>) => {
    const message = event.data;

    if (message.type === 'render') {
        view = message.view;
        document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
        render();

        return;
    }

    if (message.type === 'theme') {
        document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
    }
});

post({ type: 'ready' });
