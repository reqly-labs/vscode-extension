import { AUTH_TYPES } from '../../core/constants';
import type { Auth, AuthApiKey, AuthBasic, AuthBearer, AuthType } from '../../core/types';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { createSelect, type SelectHandle } from './select';
import { createVariableInput, type VariableInputHandle } from './variableInput';

const AUTH_LABELS: Record<AuthType, string> = {
    none: 'No Auth',
    bearer: 'Bearer Token',
    basic: 'Basic Auth',
    'api-key': 'API Key',
};

export interface AuthEditorHandle {
    root: HTMLElement;
    refresh(): void;
    destroy(): void;
}

export interface AuthEditorOptions {
    getAuth: () => Auth;
    setAuth: (auth: Auth) => void;
}

function defaultAuth(type: AuthType): Auth {
    switch (type) {
        case 'bearer':
            return { type: 'bearer', token: '', prefix: 'Bearer' };
        case 'basic':
            return { type: 'basic', username: '', password: '' };
        case 'api-key':
            return { type: 'api-key', key: '', value: '', addTo: 'header' };
        default:
            return { type: 'none' };
    }
}

function field(label: string, control: HTMLElement): HTMLElement {
    return el(
        'label',
        { class: 'form-field' },
        el('span', { class: 'form-label', text: label }),
        control
    );
}

function secretInput(
    value: string,
    placeholder: string,
    onInput: (value: string) => void
): { root: HTMLElement; input: HTMLInputElement } {
    const input = el('input', {
        class: 'field',
        type: 'password',
        value,
        placeholder,
        spellcheck: false,
        on: { input: (event) => onInput((event.target as HTMLInputElement).value) },
    });
    const toggle = el(
        'button',
        {
            class: 'secret-toggle',
            type: 'button',
            attrs: { 'aria-label': 'Toggle visibility' },
            on: {
                click: () => {
                    const hidden = input.type === 'password';

                    input.type = hidden ? 'text' : 'password';
                    replace(toggle, icon(hidden ? 'eyeOff' : 'eye'));
                },
            },
        },
        icon('eye')
    );

    return { root: el('div', { class: 'secret-field' }, input, toggle), input };
}

function hint(...children: (string | Node)[]): HTMLElement {
    return el('div', { class: 'hint' }, icon('info'), el('p', {}, ...children));
}

function code(text: string): HTMLElement {
    return el('code', { text });
}

function bearerPreview(prefix: string): string {
    return `${prefix || 'Bearer'} <token>`;
}

function setValue(input: HTMLInputElement, value: string): void {
    if (input.value !== value) {
        input.value = value;
    }
}

function setFieldValue(handle: VariableInputHandle, value: string): void {
    if (handle.input.value === value) {
        return;
    }

    handle.input.value = value;
    handle.refresh();
}

export function createAuthEditor(options: AuthEditorOptions): AuthEditorHandle {
    const body = el('div', { class: 'auth-body' });
    let addToSelect: SelectHandle<'header' | 'query'> | null = null;
    let fields: VariableInputHandle[] = [];
    let renderedType: AuthType | null = null;
    let sync: (auth: Auth) => void = () => {};
    const select = createSelect<AuthType>({
        value: options.getAuth().type,
        ariaLabel: 'Authentication type',
        items: AUTH_TYPES.map((type) => ({ value: type, label: AUTH_LABELS[type] })),
        onChange: (type) => options.setAuth(defaultAuth(type)),
    });
    const root = el(
        'div',
        { class: 'auth-editor' },
        el('div', { class: 'auth-head' }, select.root),
        body
    );

    function patch(changes: Record<string, string>): void {
        options.setAuth({ ...options.getAuth(), ...changes } as Auth);
    }

    function variableField(
        value: string,
        placeholder: string,
        onInput: (value: string) => void
    ): VariableInputHandle {
        const handle = createVariableInput({
            value,
            className: 'field',
            placeholder,
            ariaLabel: placeholder,
            onInput,
        });

        fields.push(handle);

        return handle;
    }

    function renderBearer(auth: AuthBearer): void {
        const preview = code(bearerPreview(auth.prefix));
        const prefix = variableField(auth.prefix, 'Bearer', (value) => patch({ prefix: value }));
        const token = secretInput(auth.token, 'your-access-token', (value) =>
            patch({ token: value })
        );

        replace(
            body,
            field('Prefix', prefix.root),
            field('Token', token.root),
            hint('Sent as ', preview, ' in the Authorization header.')
        );
        sync = (next) => {
            if (next.type !== 'bearer') {
                return;
            }

            setFieldValue(prefix, next.prefix);
            setValue(token.input, next.token);
            preview.textContent = bearerPreview(next.prefix);
        };
    }

    function renderBasic(auth: AuthBasic): void {
        const username = variableField(auth.username, 'username', (value) =>
            patch({ username: value })
        );
        const password = secretInput(auth.password, 'password', (value) =>
            patch({ password: value })
        );

        replace(
            body,
            field('Username', username.root),
            field('Password', password.root),
            hint(
                'Credentials are Base64-encoded and sent as ',
                code('Basic <base64>'),
                ' in the Authorization header.'
            )
        );
        sync = (next) => {
            if (next.type !== 'basic') {
                return;
            }

            setFieldValue(username, next.username);
            setValue(password.input, next.password);
        };
    }

    function renderApiKey(auth: AuthApiKey): void {
        const target = el('span', {
            text: auth.addTo === 'header' ? 'request headers' : 'query parameters',
        });
        const key = variableField(auth.key, 'X-API-Key', (value) => patch({ key: value }));
        const value = secretInput(auth.value, 'your-api-key', (next) => patch({ value: next }));

        addToSelect = createSelect<'header' | 'query'>({
            value: auth.addTo,
            ariaLabel: 'Where to add the API key',
            items: [
                { value: 'header', label: 'Header' },
                { value: 'query', label: 'Query Param' },
            ],
            onChange: (addTo) => patch({ addTo }),
        });
        replace(
            body,
            field('Key', key.root),
            field('Value', value.root),
            field('Add to', addToSelect.root),
            hint('The key-value pair is appended to the ', target, '.')
        );
        sync = (next) => {
            if (next.type !== 'api-key') {
                return;
            }

            setFieldValue(key, next.key);
            setValue(value.input, next.value);
            addToSelect?.setValue(next.addTo);
            target.textContent = next.addTo === 'header' ? 'request headers' : 'query parameters';
        };
    }

    function releaseFields(): void {
        addToSelect?.destroy();
        addToSelect = null;
        fields.forEach((handle) => handle.destroy());
        fields = [];
    }

    function render(): void {
        const auth = options.getAuth();

        select.setValue(auth.type);
        if (renderedType === auth.type) {
            sync(auth);

            return;
        }

        releaseFields();
        renderedType = auth.type;
        switch (auth.type) {
            case 'bearer':
                renderBearer(auth);
                break;
            case 'basic':
                renderBasic(auth);
                break;
            case 'api-key':
                renderApiKey(auth);
                break;
            default:
                sync = () => {};

                replace(
                    body,
                    el('p', { class: 'empty-hint', text: 'This request has no authentication.' })
                );
        }
    }

    render();

    return {
        root,
        refresh: render,
        destroy() {
            releaseFields();
            select.destroy();
        },
    };
}
