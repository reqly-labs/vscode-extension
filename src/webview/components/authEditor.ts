import { AUTH_TYPES } from '../../core/constants';
import type { Auth, AuthApiKey, AuthBasic, AuthBearer, AuthType } from '../../core/types';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { createSelect, type SelectHandle } from './select';

const AUTH_LABELS: Record<AuthType, string> = {
    none: 'No Auth',
    bearer: 'Bearer Token',
    basic: 'Basic Auth',
    'api-key': 'API Key',
};

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

function textInput(
    value: string,
    placeholder: string,
    onInput: (value: string) => void
): HTMLInputElement {
    return el('input', {
        class: 'field',
        value,
        placeholder,
        spellcheck: false,
        on: { input: (event) => onInput((event.target as HTMLInputElement).value) },
    });
}

function secretInput(
    value: string,
    placeholder: string,
    onInput: (value: string) => void
): HTMLElement {
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

    return el('div', { class: 'secret-field' }, input, toggle);
}

function hint(...children: (string | Node)[]): HTMLElement {
    return el(
        'div',
        { class: 'hint' },
        icon('info'),
        el('p', {}, ...(children as (string | Node)[]))
    );
}

function code(text: string): HTMLElement {
    return el('code', { text });
}

export function createAuthEditor(options: {
    getAuth: () => Auth;
    setAuth: (auth: Auth) => void;
    onEdit: () => void;
}): {
    root: HTMLElement;
    refresh(): void;
} {
    const body = el('div', { class: 'auth-body' });
    let addToSelect: SelectHandle<'header' | 'query'> | null = null;
    const select = createSelect<AuthType>({
        value: options.getAuth().type,
        ariaLabel: 'Authentication type',
        items: AUTH_TYPES.map((type) => ({ value: type, label: AUTH_LABELS[type] })),
        onChange: (type) => {
            options.setAuth(defaultAuth(type));
            render();
            options.onEdit();
        },
    });
    const root = el(
        'div',
        { class: 'auth-editor' },
        el('div', { class: 'auth-head' }, select.root),
        body
    );

    function renderBearer(auth: AuthBearer): Node[] {
        const preview = code(`${auth.prefix || 'Bearer'} <token>`);

        return [
            field(
                'Prefix',
                textInput(auth.prefix, 'Bearer', (value) => {
                    auth.prefix = value;
                    preview.textContent = `${value || 'Bearer'} <token>`;
                    options.onEdit();
                })
            ),
            field(
                'Token',
                secretInput(auth.token, 'your-access-token', (value) => {
                    auth.token = value;
                    options.onEdit();
                })
            ),
            hint('Sent as ', preview, ' in the Authorization header.'),
        ];
    }

    function renderBasic(auth: AuthBasic): Node[] {
        return [
            field(
                'Username',
                textInput(auth.username, 'username', (value) => {
                    auth.username = value;
                    options.onEdit();
                })
            ),
            field(
                'Password',
                secretInput(auth.password, 'password', (value) => {
                    auth.password = value;
                    options.onEdit();
                })
            ),
            hint(
                'Credentials are Base64-encoded and sent as ',
                code('Basic <base64>'),
                ' in the Authorization header.'
            ),
        ];
    }

    function renderApiKey(auth: AuthApiKey): Node[] {
        const target = el('span', {
            text: auth.addTo === 'header' ? 'request headers' : 'query parameters',
        });

        addToSelect = createSelect<'header' | 'query'>({
            value: auth.addTo,
            ariaLabel: 'Where to add the API key',
            items: [
                { value: 'header', label: 'Header' },
                { value: 'query', label: 'Query Param' },
            ],
            onChange: (value) => {
                auth.addTo = value;
                target.textContent = value === 'header' ? 'request headers' : 'query parameters';
                options.onEdit();
            },
        });

        return [
            field(
                'Key',
                textInput(auth.key, 'X-API-Key', (value) => {
                    auth.key = value;
                    options.onEdit();
                })
            ),
            field(
                'Value',
                secretInput(auth.value, 'your-api-key', (value) => {
                    auth.value = value;
                    options.onEdit();
                })
            ),
            field('Add to', addToSelect.root),
            hint('The key-value pair is appended to the ', target, '.'),
        ];
    }

    function render(): void {
        const auth = options.getAuth();

        select.setValue(auth.type);
        addToSelect?.destroy();
        addToSelect = null;
        switch (auth.type) {
            case 'bearer':
                replace(body, ...renderBearer(auth));
                break;
            case 'basic':
                replace(body, ...renderBasic(auth));
                break;
            case 'api-key':
                replace(body, ...renderApiKey(auth));
                break;
            default:
                replace(
                    body,
                    el('p', { class: 'empty-hint', text: 'This request has no authentication.' })
                );
        }
    }

    render();

    return { root, refresh: render };
}
