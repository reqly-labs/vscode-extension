import { el } from '../dom';

const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;
/** Must match the `@media (min-width: …)` breakpoint in styles.css. */
const SIDE_BY_SIDE_QUERY = '(min-width: 1080px)';
const STORAGE_KEY = 'reqly.split';

/**
 * Webview storage can be unavailable depending on how the host is sandboxed,
 * and a throw here would take the whole panel down over a layout preference.
 */
function readFraction(): number {
    try {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : 0.5;
    } catch {
        return 0.5;
    }
}

function writeFraction(value: number): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        // The divider simply returns to its default on the next open.
    }
}

/**
 * Two panes with a draggable divider that flips between columns and rows
 * depending on how much horizontal room the editor gives us. The orientation
 * itself is decided by a CSS media query (see styles.css); this only needs to
 * know which axis to drag along.
 */
export function createSplitView(first: HTMLElement, second: HTMLElement): HTMLElement {
    let fraction = readFraction();

    const handle = el('div', {
        class: 'split-handle',
        role: 'separator',
        attrs: { 'aria-label': 'Resize panels' },
    });

    const root = el('div', { class: 'split' }, first, handle, second);

    const apply = () => {
        root.style.setProperty('--split-a', `${fraction}fr`);
        root.style.setProperty('--split-b', `${1 - fraction}fr`);
    };

    apply();

    handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        root.classList.add('is-dragging');

        const horizontal = window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
        const rect = root.getBoundingClientRect();

        const move = (moveEvent: PointerEvent) => {
            const offset = horizontal
                ? (moveEvent.clientX - rect.left) / rect.width
                : (moveEvent.clientY - rect.top) / rect.height;

            fraction = Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, offset));
            apply();
        };

        const stop = () => {
            handle.releasePointerCapture(event.pointerId);
            root.classList.remove('is-dragging');
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', stop);
            writeFraction(fraction);
        };

        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', stop);
    });

    return root;
}
