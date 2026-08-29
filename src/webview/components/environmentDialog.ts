import { emptyVariable, type Environment, type Variable } from '../../core/variables';
import { post } from '../bridge';
import { el, replace } from '../dom';
import { icon, iconButton } from '../icons';
import { on, state } from '../store';

export interface EnvironmentDialogHandle {
    root: HTMLElement;
    open(): void;
}

type Scope =
    | { kind: 'collection'; id: string; name: string; variables: Variable[] }
    | { kind: 'environment'; environment: Environment };

function scopes(): Scope[] {
    const { collection, environments } = state.environment;
    const list: Scope[] = [];

    if (collection) {
        list.push({
            kind: 'collection',
            id: collection.id,
            name: collection.name,
            variables: collection.variables,
        });
    }

    for (const environment of environments) {
        list.push({ kind: 'environment', environment });
    }

    return list;
}

function scopeId(scope: Scope): string {
    return scope.kind === 'collection' ? scope.id : scope.environment.id;
}

function scopeName(scope: Scope): string {
    return scope.kind === 'collection' ? scope.name : scope.environment.name;
}

function scopeVariables(scope: Scope): Variable[] {
    return scope.kind === 'collection' ? scope.variables : scope.environment.variables;
}

export function createEnvironmentDialog(): EnvironmentDialogHandle {
    const list = el('div', { class: 'env-list' });
    const detail = el('div', { class: 'env-detail' });
    const overlay = el('div', { class: 'dialog-overlay' });
    const root = el('div', { class: 'dialog-host' }, overlay);

    let selectedId: string | null = null;
    let creating = false;
    let confirmingId: string | null = null;

    const close = () => {
        creating = false;
        confirmingId = null;
        root.classList.remove('is-open');
    };

    const selected = (): Scope | undefined => {
        const all = scopes();

        return all.find((entry) => scopeId(entry) === selectedId) ?? all[0];
    };

    const saveVariables = (scope: Scope, variables: Variable[]) => {
        if (scope.kind === 'collection') {
            scope.variables = variables;
            state.environment.collection = { id: scope.id, name: scope.name, variables };
            post({ type: 'saveCollectionVariables', id: scope.id, variables });
        } else {
            scope.environment.variables = variables;
            post({ type: 'saveVariables', id: scope.environment.id, variables });
        }

        paintDetail();
    };

    function nameRow(scope: Scope): HTMLElement {
        const id = scopeId(scope);
        const current = selected();
        const isActive =
            scope.kind === 'environment' && scope.environment.id === state.environment.activeId;

        return el(
            'div',
            {
                class: `env-row${current && scopeId(current) === id ? ' is-selected' : ''}`,
                on: {
                    click: () => {
                        selectedId = id;
                        confirmingId = null;
                        paint();
                    },
                },
            },
            scope.kind === 'collection'
                ? el('span', { class: 'env-scope-mark', title: 'Collection variables' })
                : el('span', {
                      class: `env-dot${isActive ? ' is-on' : ''}`,
                      title: isActive ? 'Active environment' : '',
                  }),
            el('span', { class: 'env-row-name', text: scopeName(scope) }),
            el('span', {
                class: 'env-row-count',
                text: String(scopeVariables(scope).filter((entry) => entry.key.trim()).length),
            })
        );
    }

    function paintList(): void {
        const all = scopes();
        const collections = all.filter((scope) => scope.kind === 'collection');
        const environments = all.filter((scope) => scope.kind === 'environment');

        replace(
            list,
            ...(collections.length > 0
                ? [el('p', { class: 'env-group', text: 'Collection' }), ...collections.map(nameRow)]
                : []),
            el('p', { class: 'env-group', text: 'Environments' }),
            ...(environments.length > 0
                ? environments.map(nameRow)
                : [el('p', { class: 'env-blank', text: 'None yet.' })]),
            creating ? newNameField() : createButton()
        );
    }

    function createButton(): HTMLElement {
        return el(
            'button',
            {
                class: 'env-new',
                type: 'button',
                on: {
                    click: () => {
                        creating = true;
                        paintList();
                        list.querySelector<HTMLInputElement>('.env-new-field')?.focus();
                    },
                },
            },
            icon('plus'),
            'New environment'
        );
    }

    function newNameField(): HTMLElement {
        const field = el('input', {
            class: 'field env-new-field',
            placeholder: 'Environment name',
            spellcheck: false,
            attrs: { 'aria-label': 'Environment name' },
            on: {
                keydown: (event) => {
                    const key = (event as KeyboardEvent).key;

                    if (key === 'Enter') {
                        event.preventDefault();

                        const name = field.value.trim();

                        if (name) {
                            post({ type: 'createEnvironment', name });
                            creating = false;
                        }
                    }

                    if (key === 'Escape') {
                        event.preventDefault();
                        creating = false;
                        paintList();
                    }
                },
                blur: () => {
                    creating = false;
                    paintList();
                },
            },
        });

        return field;
    }

    function variableRow(scope: Scope, variable: Variable, index: number): HTMLElement {
        const current = scopeVariables(scope);
        const update = (patch: Partial<Variable>) => {
            const next = current.map((entry, position) =>
                position === index ? { ...entry, ...patch } : entry
            );

            if (patch.key !== undefined && index === current.length - 1 && patch.key) {
                next.push(emptyVariable());
            }

            saveVariables(scope, next);
        };

        const value = el('input', {
            class: 'field env-var-value',
            value: variable.value,
            spellcheck: false,
            type: variable.secret ? 'password' : 'text',
            placeholder: variable.secret ? 'Kept in the keychain' : 'Value',
            attrs: { 'aria-label': 'Variable value' },
            on: { change: () => update({ value: value.value }) },
        });
        const key = el('input', {
            class: 'field env-var-key',
            value: variable.key,
            spellcheck: false,
            placeholder: 'Variable name',
            attrs: { 'aria-label': 'Variable name' },
            on: { change: () => update({ key: key.value }) },
        });

        return el(
            'div',
            { class: `env-var${variable.enabled ? '' : ' is-disabled'}` },
            el('input', {
                class: 'env-var-check',
                type: 'checkbox',
                checked: variable.enabled,
                attrs: { 'aria-label': 'Enable variable' },
                on: {
                    change: (event) =>
                        update({ enabled: (event.target as HTMLInputElement).checked }),
                },
            }),
            key,
            value,
            scope.kind === 'environment'
                ? el(
                      'button',
                      {
                          class: `env-secret${variable.secret ? ' is-on' : ''}`,
                          type: 'button',
                          title: variable.secret
                              ? 'Kept in the operating system keychain'
                              : 'Keep this value in the operating system keychain',
                          attrs: { 'aria-pressed': variable.secret ? 'true' : 'false' },
                          on: { click: () => update({ secret: !variable.secret }) },
                      },
                      icon('lock')
                  )
                : el('span', { class: 'env-secret is-off' }),
            iconButton(
                'trash',
                'Remove variable',
                () =>
                    saveVariables(
                        scope,
                        current.filter((_, position) => position !== index)
                    ),
                'is-danger'
            )
        );
    }

    function paintDetail(): void {
        const scope = selected();

        if (!scope) {
            replace(
                detail,
                el('p', {
                    class: 'env-blank',
                    text: 'Create an environment to hold the values your requests need.',
                })
            );

            return;
        }

        const variables = scopeVariables(scope);
        const rows = variables.length > 0 ? variables : [emptyVariable()];
        const isEnvironment = scope.kind === 'environment';
        const isActive = isEnvironment && scope.environment.id === state.environment.activeId;

        replace(
            detail,
            el(
                'div',
                { class: 'env-detail-head' },
                isEnvironment
                    ? el('input', {
                          class: 'env-title-field',
                          value: scope.environment.name,
                          spellcheck: false,
                          attrs: { 'aria-label': 'Environment name' },
                          on: {
                              change: (event) => {
                                  const name = (event.target as HTMLInputElement).value.trim();

                                  if (name && name !== scope.environment.name) {
                                      post({
                                          type: 'renameEnvironment',
                                          id: scope.environment.id,
                                          name,
                                      });
                                  }
                              },
                          },
                      })
                    : el('h3', { class: 'env-title-static', text: scopeName(scope) }),
                isEnvironment
                    ? el(
                          'div',
                          { class: 'env-detail-actions' },
                          el(
                              'button',
                              {
                                  class: `env-use${isActive ? ' is-on' : ''}`,
                                  type: 'button',
                                  on: {
                                      click: () =>
                                          post({
                                              type: 'selectEnvironment',
                                              id: isActive ? null : scope.environment.id,
                                          }),
                                  },
                              },
                              isActive ? 'In use' : 'Use'
                          ),
                          iconButton('copy', 'Duplicate environment', () =>
                              post({ type: 'duplicateEnvironment', id: scope.environment.id })
                          ),
                          confirmingId === scope.environment.id
                              ? el(
                                    'button',
                                    {
                                        class: 'env-confirm',
                                        type: 'button',
                                        on: {
                                            click: () => {
                                                post({
                                                    type: 'removeEnvironment',
                                                    id: scope.environment.id,
                                                });
                                                confirmingId = null;
                                            },
                                        },
                                    },
                                    'Delete?'
                                )
                              : iconButton(
                                    'trash',
                                    'Delete environment',
                                    () => {
                                        confirmingId = scope.environment.id;
                                        paintDetail();
                                    },
                                    'is-danger'
                                )
                      )
                    : el('span', { class: 'env-badge', text: 'Travels with the collection' })
            ),
            el(
                'p',
                { class: 'env-hint' },
                isEnvironment
                    ? 'Values here override the collection. A value marked with the lock is kept in the operating system keychain, never in a file.'
                    : 'Values here are saved in the collection file and shared with anyone who opens it, so keep credentials in an environment instead.'
            ),
            el(
                'div',
                { class: 'env-var-head' },
                el('span'),
                el('span', { text: 'Name' }),
                el('span', { text: 'Value' }),
                el('span'),
                el('span')
            ),
            el(
                'div',
                { class: 'env-vars' },
                ...rows.map((variable, index) => variableRow(scope, variable, index))
            ),
            el(
                'div',
                { class: 'env-dynamic' },
                el('p', { class: 'env-group', text: 'Always available' }),
                ...state.environment.dynamic.map((entry) =>
                    el(
                        'div',
                        { class: 'env-dynamic-row' },
                        el('code', { class: 'env-dynamic-name', text: `{{${entry.name}}}` }),
                        el('span', { class: 'env-dynamic-text', text: entry.description })
                    )
                )
            )
        );
    }

    function paint(): void {
        paintList();
        paintDetail();
    }

    const panel = el(
        'div',
        { class: 'dialog', role: 'dialog', attrs: { 'aria-label': 'Environments' } },
        el(
            'header',
            { class: 'dialog-head' },
            el('h2', { class: 'dialog-title', text: 'Environments' }),
            iconButton('check', 'Done', close)
        ),
        el(
            'div',
            { class: 'dialog-body env-body' },
            el('aside', { class: 'env-side' }, list),
            detail
        )
    );

    root.appendChild(panel);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && root.classList.contains('is-open') && !creating) {
            close();
        }
    });
    on('environment', () => {
        if (root.classList.contains('is-open')) {
            paint();
        }
    });

    return {
        root,
        open() {
            const all = scopes();

            selectedId = state.environment.activeId ?? (all.length > 0 ? scopeId(all[0]) : null);
            confirmingId = null;
            creating = false;
            root.classList.add('is-open');
            paint();
        },
    };
}
