import { BODY_TYPES } from '../../core/constants';
import type { BodyType } from '../../core/types';
import { post, schedulePersist } from '../bridge';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { on, state } from '../store';
import { createAuthEditor } from './authEditor';
import { createEditor } from './codeEditor';
import { createFormDataEditor } from './formDataEditor';
import { createKvEditor } from './kvEditor';
import { createSelect } from './select';
import { createTabs } from './tabs';

const BODY_LABELS: Record<BodyType, string> = {
    none: 'None',
    json: 'JSON',
    text: 'Text',
    xml: 'XML',
    form: 'URL Encoded',
    multipart: 'Form Data',
    binary: 'Binary File',
};

function activeCount(items: { key: string; enabled: boolean }[]): number {
    return items.filter((item) => item.enabled && item.key.trim()).length;
}

export function createRequestEditor(): HTMLElement {
    const { snapshot } = state;

    const edited = () => {
        schedulePersist();
        refreshBadges();
    };

    const structural = () => {
        schedulePersist();
        refreshBadges();
    };

    const params = createKvEditor({
        items: snapshot.params,
        keyPlaceholder: 'Parameter',
        emptyLabel: 'No query parameters yet.',
        onEdit: edited,
        onStructureChange: structural,
    });

    const headers = createKvEditor({
        items: snapshot.headers,
        keyPlaceholder: 'Header',
        emptyLabel: 'No headers yet.',
        onEdit: edited,
        onStructureChange: structural,
    });

    const auth = createAuthEditor({
        getAuth: () => snapshot.auth,
        setAuth: (next) => {
            snapshot.auth = next;
        },
        onEdit: () => {
            edited();
            tabs.setDot('auth', snapshot.auth.type !== 'none');
        },
    });

    const bodyPane = el('div', { class: 'body-pane' });

    const bodySelect = createSelect<BodyType>({
        value: snapshot.bodyType,
        ariaLabel: 'Body type',
        className: 'select-wide',
        items: BODY_TYPES.map((type) => ({ value: type, label: BODY_LABELS[type] })),
        onChange: (type) => {
            snapshot.bodyType = type;
            renderBody();
            edited();
            tabs.setDot('body', type !== 'none');
        },
    });

    const bodyTab = el(
        'div',
        { class: 'pane body-tab' },
        el('div', { class: 'body-toolbar' }, bodySelect.root, buildBodyActions()),
        bodyPane
    );

    function buildBodyActions(): HTMLElement {
        const beautify = el(
            'button',
            {
                class: 'ghost-btn',
                type: 'button',
                on: {
                    click: () => {
                        if (snapshot.bodyType !== 'json') {
                            return;
                        }

                        try {
                            snapshot.body = JSON.stringify(JSON.parse(snapshot.body), null, 2);
                            renderBody();
                            edited();
                        } catch {
                            post({
                                type: 'notify',
                                level: 'warn',
                                text: 'The request body is not valid JSON.',
                            });
                        }
                    },
                },
            },
            icon('zap'),
            'Beautify'
        );

        const actions = el('div', { class: 'body-actions' }, beautify);

        const sync = () => {
            beautify.classList.toggle('is-hidden', snapshot.bodyType !== 'json');
        };

        sync();
        on('body', sync);

        return actions;
    }

    function renderBody(): void {
        const type = snapshot.bodyType;

        if (type === 'none') {
            replace(
                bodyPane,
                el('p', { class: 'empty-hint', text: 'This request does not send a body.' })
            );
            return;
        }

        if (type === 'json' || type === 'xml' || type === 'text') {
            const editor = createEditor({
                value: snapshot.body,
                language: type === 'text' ? 'text' : type,
                placeholder: type === 'json' ? '{\n  "key": "value"\n}' : '',
                onChange: (value) => {
                    snapshot.body = value;
                    edited();
                },
            });

            replace(bodyPane, editor.root);
            return;
        }

        if (type === 'form') {
            const editor = createKvEditor({
                items: snapshot.formBody,
                emptyLabel: 'No form values yet.',
                onEdit: edited,
                onStructureChange: structural,
            });

            replace(bodyPane, editor.root);
            return;
        }

        if (type === 'multipart') {
            const editor = createFormDataEditor({
                items: snapshot.multipartBody,
                onEdit: edited,
                onStructureChange: structural,
            });

            replace(bodyPane, editor.root);
            return;
        }

        replace(bodyPane, buildBinaryPicker());
    }

    function buildBinaryPicker(): HTMLElement {
        const name = snapshot.binaryPath
            ? snapshot.binaryPath.split(/[\\/]/).pop()
            : 'Choose a file…';

        return el(
            'div',
            { class: 'binary-picker' },
            el(
                'button',
                {
                    class: `file-pick${snapshot.binaryPath ? ' has-file' : ''}`,
                    type: 'button',
                    title: snapshot.binaryPath || 'Choose a file',
                    on: {
                        click: () => post({ type: 'pickFile', target: 'binary', fieldId: '' }),
                    },
                },
                icon('file'),
                el('span', { class: 'file-pick-name', text: name ?? '' })
            ),
            snapshot.binaryPath
                ? el('p', { class: 'empty-hint', text: snapshot.binaryPath })
                : el('p', {
                      class: 'empty-hint',
                      text: 'The file is streamed as the raw request body.',
                  })
        );
    }

    const panes: Record<string, HTMLElement> = {
        params: el('div', { class: 'pane' }, params.root),
        headers: el('div', { class: 'pane' }, headers.root),
        body: bodyTab,
        auth: el('div', { class: 'pane' }, auth.root),
    };

    const content = el('div', { class: 'pane-host' });

    const tabs = createTabs({
        items: [
            { id: 'params', label: 'Params' },
            { id: 'headers', label: 'Headers' },
            { id: 'body', label: 'Body' },
            { id: 'auth', label: 'Auth' },
        ],
        active: state.activeRequestTab,
        onChange: (id) => {
            state.activeRequestTab = id;
            showPane(id);
            schedulePersist();
        },
    });

    function showPane(id: string): void {
        replace(content, panes[id] ?? panes.params);
    }

    function refreshBadges(): void {
        const paramCount = activeCount(snapshot.params);
        const headerCount = activeCount(snapshot.headers);

        tabs.setBadge('params', paramCount > 0 ? String(paramCount) : null);
        tabs.setBadge('headers', headerCount > 0 ? String(headerCount) : null);
        tabs.setDot('body', snapshot.bodyType !== 'none');
        tabs.setDot('auth', snapshot.auth.type !== 'none');
    }

    on('params', () => {
        params.refresh();
        refreshBadges();
    });

    on('headers', () => {
        headers.refresh();
        refreshBadges();
    });

    on('auth', () => {
        auth.refresh();
        refreshBadges();
    });

    on('body', () => {
        bodySelect.setValue(snapshot.bodyType);
        renderBody();
        refreshBadges();
    });

    on('requestTab', () => {
        tabs.setActive(state.activeRequestTab);
        showPane(state.activeRequestTab);
    });

    renderBody();
    refreshBadges();
    showPane(state.activeRequestTab);

    return el(
        'section',
        { class: 'panel request-panel' },
        el('div', { class: 'panel-head' }, tabs.root),
        content
    );
}
