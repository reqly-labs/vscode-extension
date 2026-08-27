import { emptyFormField, type FormField } from '../../core/types';
import { post } from '../bridge';
import { el, replace } from '../dom';
import { icon, iconButton } from '../icons';
import { createSelect, type SelectHandle } from './select';
function fileName(path: string): string {
    return path.split(/[\/]/).pop() ?? path;
}
export function createFormDataEditor(options: {
    items: () => FormField[];
    onStructureChange: () => void;
    onEdit: () => void;
}): {
    root: HTMLElement;
    refresh(): void;
    destroy(): void;
} {
    const rows = el('div', { class: 'kv-rows' });
    let activeSelects: SelectHandle<'text' | 'file'>[] = [];
    const addButton = el(
        'button',
        {
            class: 'ghost-btn',
            type: 'button',
            on: {
                click: () => {
                    options.items().push(emptyFormField());
                    render();
                    options.onStructureChange();
                },
            },
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
    function buildValueCell(item: FormField): HTMLElement {
        if (item.type === 'file') {
            return el(
                'button',
                {
                    class: `file-pick${item.filePath ? ' has-file' : ''}`,
                    type: 'button',
                    title: item.filePath || 'Choose a file',
                    on: {
                        click: () =>
                            post({ type: 'pickFile', target: 'multipart', fieldId: item.id }),
                    },
                },
                icon('file'),
                el('span', {
                    class: 'file-pick-name',
                    text: item.filePath ? fileName(item.filePath) : 'Choose file…',
                })
            );
        }
        return el('input', {
            class: 'field kv-value',
            value: item.value,
            spellcheck: false,
            placeholder: 'Value',
            on: {
                input: (event) => {
                    item.value = (event.target as HTMLInputElement).value;
                    options.onEdit();
                },
            },
        });
    }
    function buildRow(item: FormField): HTMLElement {
        const valueCell = el('div', { class: 'kv-value-cell' }, buildValueCell(item));
        const typeSelect = createSelect<'text' | 'file'>({
            value: item.type,
            ariaLabel: 'Field type',
            className: 'select-compact',
            items: [
                { value: 'text', label: 'Text' },
                { value: 'file', label: 'File' },
            ],
            onChange: (type) => {
                item.type = type;
                replace(valueCell, buildValueCell(item));
                options.onEdit();
            },
        });
        activeSelects.push(typeSelect);
        return el(
            'div',
            { class: `kv-row is-form${item.enabled ? '' : ' is-disabled'}` },
            el('input', {
                class: 'kv-check',
                type: 'checkbox',
                checked: item.enabled,
                attrs: { 'aria-label': 'Enable field' },
                on: {
                    change: (event) => {
                        item.enabled = (event.target as HTMLInputElement).checked;
                        render();
                        options.onEdit();
                    },
                },
            }),
            el('input', {
                class: 'field kv-key',
                value: item.key,
                spellcheck: false,
                placeholder: 'Field name',
                on: {
                    input: (event) => {
                        item.key = (event.target as HTMLInputElement).value;
                        options.onEdit();
                    },
                },
            }),
            typeSelect.root,
            valueCell,
            iconButton(
                'trash',
                'Remove field',
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
            )
        );
    }
    function render(): void {
        activeSelects.forEach((select) => select.destroy());
        activeSelects = [];
        const items = options.items();
        if (items.length === 0) {
            replace(rows, el('p', { class: 'empty-hint', text: 'No form fields yet.' }));
            return;
        }
        replace(rows, ...items.map(buildRow));
    }
    render();
    return {
        root,
        refresh: render,
        destroy() {
            activeSelects.forEach((select) => select.destroy());
            activeSelects = [];
        },
    };
}
