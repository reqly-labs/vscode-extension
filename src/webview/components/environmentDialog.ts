import { emptyVariable, type Environment, type Variable } from '../../core/variables';
import { post } from '../bridge';
import { el, replace } from '../dom';
import { icon, iconButton } from '../icons';
import { on, state } from '../store';

export interface EnvironmentDialogHandle {
    root: HTMLElement;
    open(): void;
}

function activeEnvironments(): Environment[] {
    return state.environment.environments;
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

    const selected = (): Environment | undefined => {
        const all = activeEnvironments();

        return all.find((entry) => entry.id === selectedId) ?? all[0];
    };

    const saveVariables = (environment: Environment, variables: Variable[]) => {
        environment.variables = variables;
        post({ type: 'saveVariables', id: environment.id, variables });
        paintDetail();
    };

    function nameRow(environment: Environment): HTMLElement {
        const isActive = environment.id === state.environment.activeId;
        const row = el(
            'div',
            {
                class: `env-row${environment.id === selected()?.id ? ' is-selected' : ''}`,
                on: {
                    click: () => {
                        selectedId = environment.id;
                        confirmingId = null;
                        paint();
                    },
                },
            },
            el('span', {
                class: `env-dot${isActive ? ' is-on' : ''}`,
                title: isActive ? 'Active environment' : '',
            }),
            el('span', { class: 'env-row-name', text: environment.name }),
            el('span', {
                class: 'env-row-count',
                text: String(environment.variables.filter((entry) => entry.key.trim()).length),
            })
        );

        return row;
    }

    function paintList(): void {
        const all = activeEnvironments();

        replace(
            list,
            ...(all.length > 0
                ? all.map(nameRow)
                : [el('p', { class: 'env-blank', text: 'No environments yet.' })]),
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

    function variableRow(environment: Environment, variable: Variable, index: number): HTMLElement {
        const update = (patch: Partial<Variable>) => {
            const next = environment.variables.map((entry, position) =>
                position === index ? { ...entry, ...patch } : entry
            );

            if (
                patch.key !== undefined &&
                index === environment.variables.length - 1 &&
                patch.key
            ) {
                next.push(emptyVariable());
            }

            saveVariables(environment, next);
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
            el(
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
            ),
            iconButton(
                'trash',
                'Remove variable',
                () =>
                    saveVariables(
                        environment,
                        environment.variables.filter((_, position) => position !== index)
                    ),
                'is-danger'
            )
        );
    }

    function paintDetail(): void {
        const environment = selected();

        if (!environment) {
            replace(
                detail,
                el('p', {
                    class: 'env-blank',
                    text: 'Create an environment to hold the values your requests need.',
                })
            );

            return;
        }

        const isActive = environment.id === state.environment.activeId;
        const rows = environment.variables.length > 0 ? environment.variables : [emptyVariable()];

        replace(
            detail,
            el(
                'div',
                { class: 'env-detail-head' },
                el('input', {
                    class: 'env-title-field',
                    value: environment.name,
                    spellcheck: false,
                    attrs: { 'aria-label': 'Environment name' },
                    on: {
                        change: (event) => {
                            const name = (event.target as HTMLInputElement).value.trim();

                            if (name && name !== environment.name) {
                                post({ type: 'renameEnvironment', id: environment.id, name });
                            }
                        },
                    },
                }),
                el(
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
                                        id: isActive ? null : environment.id,
                                    }),
                            },
                        },
                        isActive ? 'In use' : 'Use'
                    ),
                    iconButton('copy', 'Duplicate environment', () =>
                        post({ type: 'duplicateEnvironment', id: environment.id })
                    ),
                    confirmingId === environment.id
                        ? el(
                              'button',
                              {
                                  class: 'env-confirm',
                                  type: 'button',
                                  on: {
                                      click: () => {
                                          post({
                                              type: 'removeEnvironment',
                                              id: environment.id,
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
                                  confirmingId = environment.id;
                                  paintDetail();
                              },
                              'is-danger'
                          )
                )
            ),
            el(
                'p',
                { class: 'env-hint' },
                'Write ',
                el('code', { text: '{{name}}' }),
                ' anywhere in a request to use one of these. A value marked with the lock is kept in the operating system keychain, never in the collection file.'
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
                ...rows.map((variable, index) => variableRow(environment, variable, index))
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
            selectedId = state.environment.activeId ?? activeEnvironments()[0]?.id ?? null;
            confirmingId = null;
            creating = false;
            root.classList.add('is-open');
            paint();
        },
    };
}
