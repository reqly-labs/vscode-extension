import { icon, type IconName } from './icons';

export interface MenuItem {
    label: string;
    iconName: IconName;
    onSelect: () => void;
    danger?: boolean;
    separatorBefore?: boolean;
}

let openMenu: HTMLElement | undefined;

export function closeContextMenu(): void {
    openMenu?.remove();
    openMenu = undefined;
}

document.addEventListener('mousedown', (event) => {
    if (!(event.target as HTMLElement | null)?.closest('.context-menu')) {
        closeContextMenu();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeContextMenu();
    }
});

window.addEventListener('blur', closeContextMenu);
window.addEventListener('resize', closeContextMenu);

export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    for (const item of items) {
        if (item.separatorBefore) {
            const separator = document.createElement('div');
            separator.className = 'context-separator';
            menu.appendChild(separator);
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `context-item${item.danger ? ' is-danger' : ''}`;
        button.appendChild(icon(item.iconName));
        button.appendChild(document.createTextNode(item.label));

        button.addEventListener('click', () => {
            closeContextMenu();
            item.onSelect();
        });

        menu.appendChild(button);
    }

    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    document.body.appendChild(menu);
    openMenu = menu;

    const { offsetWidth, offsetHeight } = menu;
    const left = Math.max(4, Math.min(x, window.innerWidth - offsetWidth - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - offsetHeight - 4));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}
