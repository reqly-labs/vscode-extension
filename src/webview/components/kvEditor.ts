import { emptyKeyValue, type KeyValue } from '../../core/types';
import { el, replace } from '../dom';
import { icon, iconButton } from '../icons';
import { createVariableInput } from './variableInput';

export interface KvEditorHandle {
    root: HTMLElement;
    refresh(): void;
}

export function createKvEditor(options: {
    items: () => KeyValue[];
    onStructureChange: () => void;
    onEdit: () => void;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    emptyLabel?: string;
}): KvEditorHandle {
    const rows = el('div', { class: 'kv-rows' });
    const addButton = el(
        'button',
        {
            class: 'ghost-btn',
            type: 'button',
            on: {
                click: () => {
                    options.items().push(emptyKeyValue());
                    render();
                    options.onStructureChange();
                    rows.querySelector<HTMLInputElement>('.kv-row:last-child .kv-key')?.focus();
                },
            },
        },
        icon('plus'),
        'Add'
    );
    const root = el(
        'div',
        { class: 'kv-editor' },
        rows,
        el('div', { class: 'kv-actions' }, addButton)
    );

    function render(): void {
        const items = options.items();

        if (items.length === 0) {
            replace(
                rows,
                el('p', { class: 'empty-hint', text: options.emptyLabel ?? 'No entries yet.' })
            );

            return;
        }

        replace(rows, ...items.map(buildRow));
    }

    function buildRow(item: KeyValue): HTMLElement {
        const toggle = el('input', {
            class: 'kv-check',
            type: 'checkbox',
            checked: item.enabled,
            attrs: { 'aria-label': 'Enable entry' },
            on: {
                change: (event) => {
                    item.enabled = (event.target as HTMLInputElement).checked;
                    row.classList.toggle('is-disabled', !item.enabled);
                    options.onEdit();
                },
            },
        });
        const keyInput = createVariableInput({
            value: item.key,
            className: 'field kv-key',
            placeholder: options.keyPlaceholder ?? 'Key',
            ariaLabel: options.keyPlaceholder ?? 'Key',
            onInput: (value) => {
                item.key = value;
                options.onEdit();
            },
        });
        const valueInput = createVariableInput({
            value: item.value,
            className: 'field kv-value',
            placeholder: options.valuePlaceholder ?? 'Value',
            ariaLabel: options.valuePlaceholder ?? 'Value',
            onInput: (value) => {
                item.value = value;
                options.onEdit();
            },
        });
        const remove = iconButton(
            'trash',
            'Remove entry',
            () => {
                const items = options.items();
                const index = items.indexOf(item);

                if (index >= 0) {
                    items.splice(index, 1);
                    render();
                    options.onStructureChange();
                }
            },
            'is-danger'
        );
        const row = el(
            'div',
            { class: `kv-row${item.enabled ? '' : ' is-disabled'}` },
            toggle,
            keyInput.root,
            valueInput.root,
            remove
        );

        return row;
    }

    render();

    return { root, refresh: render };
}
