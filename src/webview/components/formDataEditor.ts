import { emptyFormField, type FormField } from '../../core/types';
import { post } from '../bridge';
import { el, reconcile, replace } from '../dom';
import { icon, iconButton } from '../icons';
import { createSelect } from './select';

interface Row {
    root: HTMLElement;
    update(item: FormField): void;
    destroy(): void;
}

export interface FormDataEditorHandle {
    root: HTMLElement;
    refresh(): void;
    destroy(): void;
}

export interface FormDataEditorOptions {
    items: () => readonly FormField[];
    edit: (change: (items: FormField[]) => void) => void;
}

function fileName(path: string): string {
    return path.split(/[\/]/).pop() ?? path;
}

export function createFormDataEditor(options: FormDataEditorOptions): FormDataEditorHandle {
    const rows = el('div', { class: 'kv-rows' });
    const built = new Map<string, Row>();
    const emptyHint = el('p', { class: 'empty-hint', text: 'No form fields yet.' });
    const addButton = el(
        'button',
        {
            class: 'ghost-btn',
            type: 'button',
            on: { click: () => options.edit((items) => items.push(emptyFormField())) },
        },
        icon('plus'),
        'Add field'
    );
    const root = el(
        'div',
        { class: 'kv-editor' },
        rows,
        el('div', { class: 'kv-actions' }, addButton)
    );

    function write(id: string, patch: Partial<FormField>): void {
        options.edit((items) => {
            const entry = items.find((item) => item.id === id);

            if (entry) {
                Object.assign(entry, patch);
            }
        });
    }

    function buildRow(item: FormField): Row {
        const id = item.id;
        const valueCell = el('div', { class: 'kv-value-cell' });
        const textField = el('input', {
            class: 'field kv-value',
            value: item.value,
            spellcheck: false,
            placeholder: 'Value',
            on: {
                input: (event) => write(id, { value: (event.target as HTMLInputElement).value }),
            },
        });
        const filePick = el(
            'button',
            {
                class: 'file-pick',
                type: 'button',
                on: { click: () => post({ type: 'pickFile', target: 'multipart', fieldId: id }) },
            },
            icon('file'),
            el('span', { class: 'file-pick-name' })
        );
        const fileLabel = filePick.querySelector('.file-pick-name') as HTMLElement;
        const typeSelect = createSelect<'text' | 'file'>({
            value: item.type,
            ariaLabel: 'Field type',
            className: 'select-compact',
            items: [
                { value: 'text', label: 'Text' },
                { value: 'file', label: 'File' },
            ],
            onChange: (type) => write(id, { type }),
        });
        const toggle = el('input', {
            class: 'kv-check',
            type: 'checkbox',
            checked: item.enabled,
            attrs: { 'aria-label': 'Enable field' },
            on: {
                change: (event) =>
                    write(id, { enabled: (event.target as HTMLInputElement).checked }),
            },
        });
        const keyField = el('input', {
            class: 'field kv-key',
            value: item.key,
            spellcheck: false,
            placeholder: 'Field name',
            on: { input: (event) => write(id, { key: (event.target as HTMLInputElement).value }) },
        });
        const rowRoot = el(
            'div',
            { class: 'kv-row is-form' },
            toggle,
            keyField,
            typeSelect.root,
            valueCell,
            iconButton(
                'trash',
                'Remove field',
                () =>
                    options.edit((items) => {
                        const index = items.findIndex((item) => item.id === id);

                        if (index >= 0) {
                            items.splice(index, 1);
                        }
                    }),
                'is-danger'
            )
        );

        return {
            root: rowRoot,
            update(next) {
                rowRoot.classList.toggle('is-disabled', !next.enabled);
                toggle.checked = next.enabled;
                if (keyField.value !== next.key) {
                    keyField.value = next.key;
                }

                typeSelect.setValue(next.type);
                if (next.type === 'file') {
                    filePick.classList.toggle('has-file', Boolean(next.filePath));
                    filePick.title = next.filePath || 'Choose a file';
                    fileLabel.textContent = next.filePath
                        ? fileName(next.filePath)
                        : 'Choose file…';
                    if (valueCell.firstChild !== filePick) {
                        replace(valueCell, filePick);
                    }

                    return;
                }

                if (textField.value !== next.value) {
                    textField.value = next.value;
                }

                if (valueCell.firstChild !== textField) {
                    replace(valueCell, textField);
                }
            },
            destroy() {
                typeSelect.destroy();
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
