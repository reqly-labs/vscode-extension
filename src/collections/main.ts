import './styles.css';

import type {
    CollectionsHostMessage,
    CollectionsViewMessage,
    TreeRow,
} from '../core/collectionsMessages';
import { closeContextMenu, showContextMenu } from './contextMenu';
import { icon, type IconName } from './icons';

interface VsCodeApi {
    postMessage(message: CollectionsViewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('root') as HTMLElement;

let rows: TreeRow[] = [];
let selectedId: string | null = null;
let editingId: string | null = null;
let draggingId: string | null = null;

function post(message: CollectionsViewMessage): void {
    vscode.postMessage(message);
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    return node;
}

function iconButton(name: IconName, label: string, onClick: (event: MouseEvent) => void) {
    const button = el('button', 'icon-btn');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(icon(name));

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick(event);
    });

    return button;
}

function buildToolbar(): HTMLElement {
    const bar = el('div', 'toolbar');

    const title = el('span', 'toolbar-title');
    title.textContent = 'Collections';

    const actions = el('div', 'toolbar-actions');

    actions.append(
        iconButton('plus', 'New request', () => post({ type: 'newRequest', id: null })),
        iconButton('newCollection', 'New collection', () => post({ type: 'newCollection' })),
        iconButton('panel', 'Open HTTP client', () => post({ type: 'openPanel' }))
    );

    bar.append(title, actions);

    return bar;
}

function buildEmptyState(): HTMLElement {
    const empty = el('div', 'empty');

    const text = el('p');
    text.textContent =
        'No collections yet. Group related requests together, or keep working with a single loose request.';

    const actions = el('div', 'empty-actions');

    const newCollection = el('button', 'empty-btn primary');
    newCollection.type = 'button';
    newCollection.appendChild(icon('newCollection'));
    newCollection.appendChild(document.createTextNode('New Collection'));
    newCollection.addEventListener('click', () => post({ type: 'newCollection' }));

    const newRequest = el('button', 'empty-btn');
    newRequest.type = 'button';
    newRequest.appendChild(icon('plus'));
    newRequest.appendChild(document.createTextNode('New Request'));
    newRequest.addEventListener('click', () => post({ type: 'newRequest', id: null }));

    actions.append(newCollection, newRequest);
    empty.append(text, actions);

    return empty;
}

function contextItemsFor(row: TreeRow) {
    const isGroup = row.kind !== 'request';

    return [
        ...(isGroup
            ? [
                  {
                      label: 'New request',
                      iconName: 'plus' as IconName,
                      onSelect: () => post({ type: 'newRequest', id: row.id }),
                  },
                  {
                      label: 'New folder',
                      iconName: 'newFolder' as IconName,
                      onSelect: () => post({ type: 'newFolder', id: row.id }),
                  },
              ]
            : [
                  {
                      label: 'Open',
                      iconName: 'panel' as IconName,
                      onSelect: () => post({ type: 'open', id: row.id }),
                  },
              ]),
        {
            label: 'Rename',
            iconName: 'pencil' as IconName,
            onSelect: () => beginRename(row.id),
            separatorBefore: true,
        },
        {
            label: 'Duplicate',
            iconName: 'copy' as IconName,
            onSelect: () => post({ type: 'duplicate', id: row.id }),
        },
        {
            label: row.kind === 'collection' ? 'Delete collection' : `Delete ${row.kind}`,
            iconName: 'trash' as IconName,
            onSelect: () => post({ type: 'delete', id: row.id }),
            danger: true,
            separatorBefore: true,
        },
    ];
}

function clearDropMarkers(): void {
    root.querySelectorAll('.is-drop-into, .is-drop-before').forEach((node) => {
        node.classList.remove('is-drop-into', 'is-drop-before');
    });
}

function buildRow(row: TreeRow): HTMLElement {
    const isGroup = row.kind !== 'request';
    const node = el('div', `row${isGroup ? ' is-group' : ''}`);

    node.dataset.id = row.id;
    node.draggable = true;
    node.style.paddingLeft = `${4 + row.depth * 12}px`;
    node.title = row.kind === 'request' ? row.url || row.name : row.name;

    if (row.id === selectedId) {
        node.classList.add('is-selected');
    }

    if (row.isActive) {
        node.classList.add('is-active');
    }

    const twisty = el(
        'span',
        `twisty${row.expanded ? ' is-open' : ''}${isGroup ? '' : ' is-empty'}`
    );
    twisty.appendChild(icon('chevron'));

    if (isGroup) {
        twisty.addEventListener('click', (event) => {
            event.stopPropagation();
            post({ type: 'toggle', id: row.id });
        });
    }

    node.appendChild(twisty);

    if (isGroup) {
        const glyph = el('span', 'row-icon');
        glyph.appendChild(icon(row.kind === 'collection' ? 'collection' : 'folder'));
        node.appendChild(glyph);
    } else if (row.method) {
        const method = el('span', `row-method method-${row.method.toLowerCase()}`);
        method.textContent = row.method;
        node.appendChild(method);
    }

    if (row.id === editingId) {
        node.appendChild(buildRenameInput(row));
        return node;
    }

    const label = el('span', 'row-label');
    label.textContent = row.name;
    node.appendChild(label);

    if (isGroup && row.childCount > 0) {
        const count = el('span', 'row-count');
        count.textContent = String(row.childCount);
        node.appendChild(count);
    }

    const actions = el('div', 'row-actions');

    if (isGroup) {
        actions.appendChild(
            iconButton('plus', 'New request here', () => post({ type: 'newRequest', id: row.id }))
        );
    }

    actions.appendChild(iconButton('trash', 'Delete', () => post({ type: 'delete', id: row.id })));

    node.appendChild(actions);

    node.addEventListener('click', () => {
        selectedId = row.id;

        if (isGroup) {
            post({ type: 'toggle', id: row.id });
        } else {
            post({ type: 'open', id: row.id });
        }
    });

    node.addEventListener('dblclick', (event) => {
        event.preventDefault();
        beginRename(row.id);
    });

    node.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        selectedId = row.id;
        render();
        showContextMenu(event.clientX, event.clientY, contextItemsFor(row));
    });

    node.addEventListener('dragstart', (event) => {
        draggingId = row.id;
        node.classList.add('is-dragging');
        event.dataTransfer?.setData('text/plain', row.id);

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    });

    node.addEventListener('dragend', () => {
        draggingId = null;
        node.classList.remove('is-dragging');
        clearDropMarkers();
    });

    node.addEventListener('dragover', (event) => {
        if (!draggingId || draggingId === row.id) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }

        clearDropMarkers();
        node.classList.add(isGroup ? 'is-drop-into' : 'is-drop-before');
    });

    node.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const sourceId = draggingId;
        draggingId = null;
        clearDropMarkers();

        if (sourceId && sourceId !== row.id) {
            post({ type: 'move', id: sourceId, targetId: row.id });
        }
    });

    return node;
}

function buildRenameInput(row: TreeRow): HTMLInputElement {
    const input = el('input', 'row-input');
    input.value = row.name;
    input.spellcheck = false;

    let settled = false;

    const finish = (commit: boolean) => {
        if (settled) {
            return;
        }

        settled = true;
        editingId = null;

        const next = input.value.trim();

        if (commit && next && next !== row.name) {
            post({ type: 'rename', id: row.id, name: next });
        } else {
            render();
        }
    };

    input.addEventListener('keydown', (event) => {
        event.stopPropagation();

        if (event.key === 'Enter') {
            finish(true);
        } else if (event.key === 'Escape') {
            finish(false);
        }
    });

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (event) => event.stopPropagation());

    queueMicrotask(() => {
        input.focus();
        input.select();
    });

    return input;
}

function beginRename(id: string): void {
    editingId = id;
    selectedId = id;
    render();
}

function render(): void {
    closeContextMenu();
    root.replaceChildren();
    root.appendChild(buildToolbar());

    if (rows.length === 0) {
        root.appendChild(buildEmptyState());
        return;
    }

    const tree = el('div', 'tree');
    rows.forEach((row) => tree.appendChild(buildRow(row)));

    tree.addEventListener('dragover', (event) => {
        if (draggingId) {
            event.preventDefault();
        }
    });

    tree.addEventListener('drop', (event) => {
        const sourceId = draggingId;
        draggingId = null;
        clearDropMarkers();

        if (sourceId && event.target === tree) {
            post({ type: 'move', id: sourceId, targetId: null });
        }
    });

    root.appendChild(tree);
}

window.addEventListener('keydown', (event) => {
    if (editingId || rows.length === 0) {
        return;
    }

    const index = rows.findIndex((row) => row.id === selectedId);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        const target = rows[Math.max(0, Math.min(next, rows.length - 1))];

        if (target) {
            selectedId = target.id;
            render();

            const selected = root.querySelector('.row.is-selected');

            if (selected && typeof selected.scrollIntoView === 'function') {
                selected.scrollIntoView({ block: 'nearest' });
            }
        }

        return;
    }

    const current = rows[index];

    if (!current) {
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        post(
            current.kind === 'request'
                ? { type: 'open', id: current.id }
                : { type: 'toggle', id: current.id }
        );
    } else if (event.key === 'F2') {
        event.preventDefault();
        beginRename(current.id);
    } else if (event.key === 'Delete') {
        event.preventDefault();
        post({ type: 'delete', id: current.id });
    }
});

window.addEventListener('message', (event: MessageEvent<CollectionsHostMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'render':
            rows = message.rows;
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');

            if (editingId && !rows.some((row) => row.id === editingId)) {
                editingId = null;
            }

            render();
            break;

        case 'theme':
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
            break;

        case 'beginRename':
            beginRename(message.id);
            break;
    }
});

post({ type: 'ready' });
