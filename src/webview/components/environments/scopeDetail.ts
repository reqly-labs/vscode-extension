import type { Variable } from '../../../core/variables';
import { el, replace } from '../../dom';
import { iconButton } from '../../icons';
import { createVariableTable } from './variableTable';
import type { Scope } from './scopes';

const ENVIRONMENT_HINT =
    'Values here override the collection. A value marked with the lock is kept in the operating system keychain, never in a file.';

const COLLECTION_HINT =
    'Values here are saved in the collection file and shared with anyone who opens it, so keep credentials in an environment instead.';

const EMPTY_HINT = 'Create an environment to hold the values your requests need.';

export interface ScopeDetailHandle {
    root: HTMLElement;
    render(scope: Scope | undefined, activeId: string | null, dynamic: DynamicEntry[]): void;
    clearConfirmation(): void;
}

export interface DynamicEntry {
    name: string;
    description: string;
}

export interface ScopeDetailOptions {
    onSave: (scope: Scope, variables: Variable[]) => void;
    onRename: (id: string, name: string) => void;
    onUse: (id: string | null) => void;
    onDuplicate: (id: string) => void;
    onRemove: (id: string) => void;
}

export function createScopeDetail(options: ScopeDetailOptions): ScopeDetailHandle {
    const head = el('div', { class: 'env-detail-head' });
    const hint = el('p', { class: 'env-hint' });
    const columns = el(
        'div',
        { class: 'env-var-head' },
        el('span'),
        el('span', { text: 'Name' }),
        el('span', { text: 'Value' }),
        el('span'),
        el('span')
    );
    const dynamicList = el('div', { class: 'env-dynamic' });
    const table = createVariableTable({ onSave: options.onSave });
    const root = el('div', { class: 'env-detail' });

    let renderedId: string | null = null;
    let headSignature = '';
    let confirming = false;
    let title: HTMLInputElement | null = null;

    function buildActions(scope: Scope, isActive: boolean): HTMLElement {
        return el(
            'div',
            { class: 'env-detail-actions' },
            el(
                'button',
                {
                    class: `env-use${isActive ? ' is-on' : ''}`,
                    type: 'button',
                    on: { click: () => options.onUse(isActive ? null : scope.id) },
                },
                isActive ? 'In use' : 'Use'
            ),
            iconButton('copy', 'Duplicate environment', () => options.onDuplicate(scope.id)),
            confirming
                ? el(
                      'button',
                      {
                          class: 'env-confirm',
                          type: 'button',
                          on: {
                              click: () => {
                                  confirming = false;
                                  options.onRemove(scope.id);
                              },
                          },
                      },
                      'Delete?'
                  )
                : iconButton(
                      'trash',
                      'Delete environment',
                      () => {
                          confirming = true;
                          paintHead(scope, isActive);
                      },
                      'is-danger'
                  )
        );
    }

    function paintHead(scope: Scope, isActive: boolean): void {
        const signature = `${scope.id}|${scope.kind}|${isActive}|${confirming}`;

        if (signature === headSignature) {
            if (title && title.value !== scope.name) {
                title.value = scope.name;
            }

            if (scope.kind === 'collection') {
                const label = head.querySelector('.env-title-static');

                if (label) {
                    label.textContent = scope.name;
                }
            }

            return;
        }

        headSignature = signature;
        if (scope.kind !== 'environment') {
            title = null;
            replace(
                head,
                el('h3', { class: 'env-title-static', text: scope.name }),
                el('span', { class: 'env-badge', text: 'Travels with the collection' })
            );

            return;
        }

        title = el('input', {
            class: 'env-title-field',
            value: scope.name,
            spellcheck: false,
            attrs: { 'aria-label': 'Environment name' },
            on: {
                change: (event) => {
                    const name = (event.target as HTMLInputElement).value.trim();

                    if (name && name !== scope.name) {
                        options.onRename(scope.id, name);
                    }
                },
            },
        });
        replace(head, title, buildActions(scope, isActive));
    }

    function paintDynamic(entries: DynamicEntry[]): void {
        replace(
            dynamicList,
            el('p', { class: 'env-group', text: 'Always available' }),
            ...entries.map((entry) =>
                el(
                    'div',
                    { class: 'env-dynamic-row' },
                    el('code', { class: 'env-dynamic-name', text: `{{${entry.name}}}` }),
                    el('span', { class: 'env-dynamic-text', text: entry.description })
                )
            )
        );
    }

    return {
        root,

        render(scope, activeId, dynamic) {
            if (!scope) {
                renderedId = null;
                replace(root, el('p', { class: 'env-blank', text: EMPTY_HINT }));

                return;
            }

            const isActive = scope.kind === 'environment' && scope.id === activeId;

            if (renderedId !== scope.id) {
                renderedId = scope.id;
                confirming = false;
                headSignature = '';
                replace(root, head, hint, columns, table.root, dynamicList);
            }

            paintHead(scope, isActive);
            hint.textContent = scope.kind === 'environment' ? ENVIRONMENT_HINT : COLLECTION_HINT;
            table.render(scope);
            paintDynamic(dynamic);
        },

        clearConfirmation() {
            confirming = false;
        },
    };
}
