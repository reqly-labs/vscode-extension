import { el, replace } from '../../dom';
import { icon } from '../../icons';
import { namedCount, type Scope } from './scopes';

export interface ScopeListHandle {
    root: HTMLElement;
    render(scopes: Scope[], selectedId: string | null, activeId: string | null): void;
    isCreating(): boolean;
    cancelCreate(): void;
}

export interface ScopeListOptions {
    onSelect: (id: string) => void;
    onCreate: (name: string) => void;
}

export function createScopeList(options: ScopeListOptions): ScopeListHandle {
    const root = el('div', { class: 'env-list' });

    let creating = false;
    let scopes: Scope[] = [];
    let selectedId: string | null = null;
    let activeId: string | null = null;

    function nameRow(scope: Scope): HTMLElement {
        const isActive = scope.kind === 'environment' && scope.id === activeId;

        return el(
            'div',
            {
                class: `env-row${scope.id === selectedId ? ' is-selected' : ''}`,
                on: { click: () => options.onSelect(scope.id) },
            },
            scope.kind === 'collection'
                ? el('span', { class: 'env-scope-mark', title: 'Collection variables' })
                : el('span', {
                      class: `env-dot${isActive ? ' is-on' : ''}`,
                      title: isActive ? 'Active environment' : '',
                  }),
            el('span', { class: 'env-row-name', text: scope.name }),
            el('span', { class: 'env-row-count', text: String(namedCount(scope)) })
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
                        paint();
                        root.querySelector<HTMLInputElement>('.env-new-field')?.focus();
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
                            creating = false;
                            options.onCreate(name);
                        }
                    }

                    if (key === 'Escape') {
                        event.preventDefault();
                        creating = false;
                        paint();
                    }
                },
                blur: () => {
                    creating = false;
                    paint();
                },
            },
        });

        return field;
    }

    function paint(): void {
        const collections = scopes.filter((scope) => scope.kind === 'collection');
        const environments = scopes.filter((scope) => scope.kind === 'environment');

        replace(
            root,
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

    return {
        root,
        render(nextScopes, nextSelectedId, nextActiveId) {
            scopes = nextScopes;
            selectedId = nextSelectedId;
            activeId = nextActiveId;
            paint();
        },
        isCreating: () => creating,
        cancelCreate() {
            creating = false;
        },
    };
}
