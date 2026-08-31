import type { ActiveRequestInfo } from '../../core/messages';
import { post } from '../bridge';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { persistable, selectDirty, watch } from '../store';
import { createEnvironmentPicker } from './environmentPicker';

export function createRequestHeader(options: {
    onSave: () => void;
    onManageEnvironments: () => void;
}): HTMLElement {
    const mark = el('span', { class: 'request-dot', title: 'Unsaved changes' });
    const title = el('span', { class: 'request-title' });
    const trail = el('span', { class: 'request-trail' });
    const saveLabel = el('span', { text: 'Save' });
    const saveButton = el(
        'button',
        {
            class: 'ghost-btn request-save',
            type: 'button',
            on: { click: options.onSave },
        },
        icon('save'),
        saveLabel
    );
    const environment = createEnvironmentPicker({ onManage: options.onManageEnvironments });
    const root = el(
        'div',
        { class: 'request-header' },
        el('div', { class: 'request-identity' }, mark, title, trail),
        el('div', { class: 'request-tools' }, environment.root, saveButton)
    );
    const paint = ({ active, dirty }: { active: ActiveRequestInfo; dirty: boolean }) => {
        const linked = Boolean(active.id);

        title.textContent = linked ? active.name : 'Untitled request';
        title.classList.toggle('is-unsaved', !linked);
        replace(trail);
        if (linked && active.location) {
            trail.appendChild(el('span', { text: active.location }));
        } else if (!linked) {
            trail.appendChild(el('span', { text: 'not in a collection' }));
        }

        mark.classList.toggle('is-hidden', !dirty);
        saveLabel.textContent = linked ? 'Save' : 'Save to…';
        saveButton.classList.toggle('is-active', dirty);
        saveButton.title = linked
            ? 'Save changes to this request'
            : 'Save this request into a collection';
    };

    watch((state) => ({ active: state.active, dirty: selectDirty(state) }), paint);

    return root;
}

export function requestSave(): void {
    post({ type: 'save', snapshot: persistable().snapshot });
}
