import { emptyKeyValue, type KeyValue } from '../../core/types';
import { el, reconcile } from '../dom';
import { icon, iconButton } from '../icons';
import { createVariableInput, type VariableInputHandle } from './variableInput';

export interface KvEditorHandle {
    root: HTMLElement;
    refresh(): void;
    destroy(): void;
}

interface Row {
    root: HTMLElement;
    update(item: KeyValue): void;
    destroy(): void;
}

export interface KvEditorOptions {
    items: () => readonly KeyValue[];
    edit: (change: (items: KeyValue[]) => void) => void;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    emptyLabel?: string;
}

function setFieldValue(field: VariableInputHandle, value: string): void {
    if (field.input.value === value) {
        return;
    }

    field.input.value = value;
    field.refresh();
}

export function createKvEditor(options: KvEditorOptions): KvEditorHandle {
    const rows = el('div', { class: 'kv-rows' });
    const built = new Map<string, Row>();
    const emptyHint = el('p', {
        class: 'empty-hint',
        text: options.emptyLabel ?? 'No entries yet.',
    });
    const addButton = el(
        'button',
        {
            class: 'ghost-btn',
            type: 'button',
            on: {
                click: () => {
                    options.edit((items) => items.push(emptyKeyValue()));
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

    function write(id: string, patch: Partial<KeyValue>): void {
        options.edit((items) => {
            const entry = items.find((item) => item.id === id);

            if (entry) {
                Object.assign(entry, patch);
            }
        });
    }

    function buildRow(item: KeyValue): Row {
        const id = item.id;
        const toggle = el('input', {
            class: 'kv-check',
            type: 'checkbox',
            checked: item.enabled,
            attrs: { 'aria-label': 'Enable entry' },
            on: {
                change: (event) =>
                    write(id, { enabled: (event.target as HTMLInputElement).checked }),
            },
        });
        const keyInput = createVariableInput({
            value: item.key,
            className: 'field kv-key',
            placeholder: options.keyPlaceholder ?? 'Key',
            ariaLabel: options.keyPlaceholder ?? 'Key',
            onInput: (value) => write(id, { key: value }),
        });
        const valueInput = createVariableInput({
            value: item.value,
            className: 'field kv-value',
            placeholder: options.valuePlaceholder ?? 'Value',
            ariaLabel: options.valuePlaceholder ?? 'Value',
            onInput: (value) => write(id, { value }),
        });
        const remove = iconButton(
            'trash',
            'Remove entry',
            () =>
                options.edit((items) => {
                    const index = items.findIndex((item) => item.id === id);

                    if (index >= 0) {
                        items.splice(index, 1);
                    }
                }),
            'is-danger'
        );
        const root = el(
            'div',
            { class: `kv-row${item.enabled ? '' : ' is-disabled'}` },
            toggle,
            keyInput.root,
            valueInput.root,
            remove
        );

        return {
            root,
            update(next) {
                toggle.checked = next.enabled;
                root.classList.toggle('is-disabled', !next.enabled);
                setFieldValue(keyInput, next.key);
                setFieldValue(valueInput, next.value);
            },
            destroy() {
                keyInput.destroy();
                valueInput.destroy();
            },
        };
    }

    function render(): void {
        const items = options.items();
        const ids = items.map((item) => item.id);

        for (const [id, row] of [...built]) {
            if (!ids.includes(id)) {
                row.destroy();
                built.delete(id);
            }
        }

        const nodes = items.map((item) => {
            const row = built.get(item.id) ?? buildRow(item);

            built.set(item.id, row);
            row.update(item);

            return row.root;
        });

        reconcile(rows, nodes.length > 0 ? nodes : [emptyHint]);
    }

    render();

    return {
        root,
        refresh: render,
        destroy() {
            for (const row of built.values()) {
                row.destroy();
            }

            built.clear();
        },
    };
}
