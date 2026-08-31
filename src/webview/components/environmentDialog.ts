import type { Variable } from '../../core/variables';
import { post } from '../bridge';
import { el } from '../dom';
import { iconButton } from '../icons';
import { getState, mutate, watch } from '../store';
import { createScopeDetail } from './environments/scopeDetail';
import { createScopeList } from './environments/scopeList';
import { findScope, readScopes, type Scope } from './environments/scopes';

export interface EnvironmentDialogHandle {
    root: HTMLElement;
    open(): void;
}

function storeVariables(scope: Scope, variables: Variable[]): void {
    mutate((draft) => {
        if (scope.kind === 'collection') {
            if (draft.environment.collection) {
                draft.environment.collection.variables = variables;
            }

            return;
        }

        const environment = draft.environment.environments.find((entry) => entry.id === scope.id);

        if (environment) {
            environment.variables = variables;
        }
    });
}

export function createEnvironmentDialog(): EnvironmentDialogHandle {
    const overlay = el('div', { class: 'dialog-overlay' });
    const root = el('div', { class: 'dialog-host' }, overlay);

    let selectedId: string | null = null;

    const list = createScopeList({
        onSelect: (id) => {
            selectedId = id;
            detail.clearConfirmation();
            paint();
        },
        onCreate: (name) => post({ type: 'createEnvironment', name }),
    });
    const detail = createScopeDetail({
        onSave: (scope, variables) => {
            storeVariables(scope, variables);
            post(
                scope.kind === 'collection'
                    ? { type: 'saveCollectionVariables', id: scope.id, variables }
                    : { type: 'saveVariables', id: scope.id, variables }
            );
        },
        onRename: (id, name) => post({ type: 'renameEnvironment', id, name }),
        onUse: (id) => post({ type: 'selectEnvironment', id }),
        onDuplicate: (id) => post({ type: 'duplicateEnvironment', id }),
        onRemove: (id) => post({ type: 'removeEnvironment', id }),
    });

    function isOpen(): boolean {
        return root.classList.contains('is-open');
    }

    function paint(): void {
        const info = getState().environment;
        const scopes = readScopes(info);
        const selected = findScope(scopes, selectedId);

        selectedId = selected?.id ?? null;
        list.render(scopes, selectedId, info.activeId);
        detail.render(selected, info.activeId, [...info.dynamic]);
    }

    function close(): void {
        list.cancelCreate();
        detail.clearConfirmation();
        root.classList.remove('is-open');
    }

    root.appendChild(
        el(
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
                el('aside', { class: 'env-side' }, list.root),
                detail.root
            )
        )
    );
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isOpen() && !list.isCreating()) {
            close();
        }
    });
    watch(
        (state) => state.environment,
        () => {
            if (isOpen()) {
                paint();
            }
        }
    );

    return {
        root,
        open() {
            selectedId = getState().environment.activeId ?? selectedId;
            list.cancelCreate();
            detail.clearConfirmation();
            root.classList.add('is-open');
            paint();
        },
    };
}
