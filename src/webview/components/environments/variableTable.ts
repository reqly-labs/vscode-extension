import { emptyVariable, type Variable } from '../../../core/variables';
import { el, reconcile } from '../../dom';
import { icon, iconButton } from '../../icons';
import type { Immutable } from '../../store';
import type { Scope, ScopeKind } from './scopes';

interface RowHandle {
    root: HTMLElement;
    update(variable: Immutable<Variable>): void;
}

export interface VariableTableHandle {
    root: HTMLElement;
    render(scope: Scope): void;
}

export interface VariableTableOptions {
    onSave: (scope: Scope, variables: Variable[]) => void;
}

function plain(variable: Immutable<Variable>): Variable {
    return {
        id: variable.id,
        key: variable.key,
        value: variable.value,
        enabled: variable.enabled,
        secret: variable.secret,
    };
}

function secretTitle(secret: boolean): string {
    return secret
        ? 'Kept in the operating system keychain'
        : 'Keep this value in the operating system keychain';
}

export function createVariableTable(options: VariableTableOptions): VariableTableHandle {
    const root = el('div', { class: 'env-vars' });
    const built = new Map<string, RowHandle>();

    let scope: Scope | null = null;
    let blank: Variable | null = null;

    function rows(): Immutable<Variable>[] {
        if (!scope) {
            return [];
        }

        if (scope.variables.length > 0) {
            blank = null;

            return [...scope.variables];
        }

        blank ??= emptyVariable();

        return [blank];
    }

    function save(next: Variable[]): void {
        if (scope) {
            options.onSave(scope, next);
        }
    }

    function write(id: string, patch: Partial<Variable>, grow = false): void {
        const next = rows().map((entry) =>
            entry.id === id ? { ...plain(entry), ...patch } : plain(entry)
        );

        if (grow) {
            next.push(emptyVariable());
        }

        save(next);
    }

    function remove(id: string): void {
        const next = rows()
            .filter((entry) => entry.id !== id)
            .map(plain);

        save(next);
    }

    function buildRow(variable: Immutable<Variable>, kind: ScopeKind): RowHandle {
        const id = variable.id;
        const value = el('input', {
            class: 'field env-var-value',
            value: variable.value,
            spellcheck: false,
            type: variable.secret ? 'password' : 'text',
            placeholder: variable.secret ? 'Kept in the keychain' : 'Value',
            attrs: { 'aria-label': 'Variable value' },
            on: { change: () => write(id, { value: value.value }) },
        });
        const key = el('input', {
            class: 'field env-var-key',
            value: variable.key,
            spellcheck: false,
            placeholder: 'Variable name',
            attrs: { 'aria-label': 'Variable name' },
            on: {
                change: () => {
                    const list = rows();
                    const isLast = list.length > 0 && list[list.length - 1].id === id;

                    write(id, { key: key.value }, isLast && key.value.trim().length > 0);
                },
            },
        });
        const check = el('input', {
            class: 'env-var-check',
            type: 'checkbox',
            checked: variable.enabled,
            attrs: { 'aria-label': 'Enable variable' },
            on: {
                change: (event) =>
                    write(id, { enabled: (event.target as HTMLInputElement).checked }),
            },
        });
        const secret =
            kind === 'environment'
                ? el(
                      'button',
                      {
                          class: `env-secret${variable.secret ? ' is-on' : ''}`,
                          type: 'button',
                          title: secretTitle(variable.secret),
                          attrs: { 'aria-pressed': variable.secret ? 'true' : 'false' },
                          on: {
                              click: () => {
                                  const current = rows().find((entry) => entry.id === id);

                                  write(id, { secret: !current?.secret });
                              },
                          },
                      },
                      icon('lock')
                  )
                : el('span', { class: 'env-secret is-off' });
        const rowRoot = el(
            'div',
            { class: `env-var${variable.enabled ? '' : ' is-disabled'}` },
            check,
            key,
            value,
            secret,
            iconButton('trash', 'Remove variable', () => remove(id), 'is-danger')
        );

        return {
            root: rowRoot,
            update(next) {
                rowRoot.classList.toggle('is-disabled', !next.enabled);
                check.checked = next.enabled;
                if (key.value !== next.key) {
                    key.value = next.key;
                }

                if (value.value !== next.value) {
                    value.value = next.value;
                }

                value.type = next.secret ? 'password' : 'text';
                value.placeholder = next.secret ? 'Kept in the keychain' : 'Value';
                if (kind === 'environment') {
                    secret.classList.toggle('is-on', next.secret);
                    secret.setAttribute('aria-pressed', next.secret ? 'true' : 'false');
                    secret.title = secretTitle(next.secret);
                }
            },
        };
    }

    return {
        root,
        render(next: Scope) {
            if (!scope || scope.id !== next.id) {
                built.clear();
                blank = null;
            }

            scope = next;
            const list = rows();
            const ids = list.map((variable) => variable.id);

            for (const id of [...built.keys()]) {
                if (!ids.includes(id)) {
                    built.delete(id);
                }
            }

            const nodes = list.map((variable) => {
                const row = built.get(variable.id) ?? buildRow(variable, next.kind);

                built.set(variable.id, row);
                row.update(variable);

                return row.root;
            });

            reconcile(root, nodes);
        },
    };
}
