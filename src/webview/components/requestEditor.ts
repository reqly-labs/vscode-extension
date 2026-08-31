import { BODY_TYPES } from '../../core/constants';
import type { BodyType, RequestSnapshot } from '../../core/types';
import { post, schedulePersist } from '../bridge';
import { el, replace } from '../dom';
import { icon } from '../icons';
import { getState, mutate, watch, type ReadonlyAppState } from '../store';
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

interface BodyView {
    sync(): void;
    destroy(): void;
}

function activeCount(items: readonly { key: string; enabled: boolean }[]): number {
    return items.filter((item) => item.enabled && item.key.trim()).length;
}

function editSnapshot(change: (snapshot: RequestSnapshot) => void): void {
    mutate((draft) => change(draft.snapshot));
    schedulePersist();
}

export function createRequestEditor(): HTMLElement {
    const params = createKvEditor({
        items: () => getState().snapshot.params,
        keyPlaceholder: 'Parameter',
        emptyLabel: 'No query parameters yet.',
        edit: (change) => editSnapshot((snapshot) => change(snapshot.params)),
    });
    const headers = createKvEditor({
        items: () => getState().snapshot.headers,
        keyPlaceholder: 'Header',
        emptyLabel: 'No headers yet.',
        edit: (change) => editSnapshot((snapshot) => change(snapshot.headers)),
    });
    const auth = createAuthEditor({
        getAuth: () => getState().snapshot.auth,
        setAuth: (next) =>
            editSnapshot((snapshot) => {
                snapshot.auth = next;
            }),
    });
    const bodyPane = el('div', { class: 'body-pane' });
    const bodySelect = createSelect<BodyType>({
        value: getState().snapshot.bodyType,
        ariaLabel: 'Body type',
        className: 'select-wide',
        items: BODY_TYPES.map((type) => ({ value: type, label: BODY_LABELS[type] })),
        onChange: (bodyType) =>
            editSnapshot((snapshot) => {
                snapshot.bodyType = bodyType;
            }),
    });
    const beautify = el(
        'button',
        {
            class: 'ghost-btn',
            type: 'button',
            on: {
                click: () => {
                    const snapshot = getState().snapshot;

                    if (snapshot.bodyType !== 'json') {
                        return;
                    }

                    try {
                        const pretty = JSON.stringify(JSON.parse(snapshot.body), null, 2);

                        editSnapshot((draft) => {
                            draft.body = pretty;
                        });
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
    const bodyTab = el(
        'div',
        { class: 'pane body-tab' },
        el(
            'div',
            { class: 'body-toolbar' },
            bodySelect.root,
            el('div', { class: 'body-actions' }, beautify)
        ),
        bodyPane
    );

    let bodyView: BodyView | null = null;
    let renderedBodyType: BodyType | null = null;

    function buildTextBody(type: 'json' | 'xml' | 'text'): BodyView {
        const editor = createEditor({
            value: getState().snapshot.body,
            language: type === 'text' ? 'text' : type,
            placeholder: type === 'json' ? '{\n  "key": "value"\n}' : '',
            onChange: (value) =>
                editSnapshot((snapshot) => {
                    snapshot.body = value;
                }),
        });

        replace(bodyPane, editor.root);

        return {
            sync: () => editor.setValue(getState().snapshot.body),
            destroy: () => editor.destroy(),
        };
    }

    function buildFormBody(): BodyView {
        const editor = createKvEditor({
            items: () => getState().snapshot.formBody,
            emptyLabel: 'No form values yet.',
            edit: (change) => editSnapshot((snapshot) => change(snapshot.formBody)),
        });

        replace(bodyPane, editor.root);

        return { sync: editor.refresh, destroy: editor.destroy };
    }

    function buildMultipartBody(): BodyView {
        const editor = createFormDataEditor({
            items: () => getState().snapshot.multipartBody,
            edit: (change) => editSnapshot((snapshot) => change(snapshot.multipartBody)),
        });

        replace(bodyPane, editor.root);

        return { sync: editor.refresh, destroy: editor.destroy };
    }

    function buildBinaryBody(): BodyView {
        const label = el('span', { class: 'file-pick-name' });
        const picker = el(
            'button',
            {
                class: 'file-pick',
                type: 'button',
                on: { click: () => post({ type: 'pickFile', target: 'binary', fieldId: '' }) },
            },
            icon('file'),
            label
        );
        const caption = el('p', { class: 'empty-hint' });

        replace(bodyPane, el('div', { class: 'binary-picker' }, picker, caption));

        return {
            sync() {
                const path = getState().snapshot.binaryPath;

                picker.classList.toggle('has-file', Boolean(path));
                picker.title = path || 'Choose a file';
                label.textContent = path ? (path.split(/[\\/]/).pop() ?? path) : 'Choose a file…';
                caption.textContent = path || 'The file is streamed as the raw request body.';
            },
            destroy: () => {},
        };
    }

    function buildBodyView(type: BodyType): BodyView {
        switch (type) {
            case 'json':
            case 'xml':
            case 'text':
                return buildTextBody(type);
            case 'form':
                return buildFormBody();
            case 'multipart':
                return buildMultipartBody();
            case 'binary':
                return buildBinaryBody();
            default:
                replace(
                    bodyPane,
                    el('p', { class: 'empty-hint', text: 'This request does not send a body.' })
                );

                return { sync: () => {}, destroy: () => {} };
        }
    }

    function renderBody(type: BodyType): void {
        if (renderedBodyType === type) {
            bodyView?.sync();

            return;
        }

        bodyView?.destroy();
        renderedBodyType = type;
        bodyView = buildBodyView(type);
        bodyView.sync();
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
        active: getState().activeRequestTab,
        onChange: (id) => {
            mutate((draft) => {
                draft.activeRequestTab = id;
            });
            schedulePersist();
        },
    });

    function selectBadges(state: ReadonlyAppState) {
        return {
            params: activeCount(state.snapshot.params),
            headers: activeCount(state.snapshot.headers),
            body: state.snapshot.bodyType !== 'none',
            auth: state.snapshot.auth.type !== 'none',
        };
    }

    watch(
        (state) => state.snapshot.params,
        () => params.refresh()
    );
    watch(
        (state) => state.snapshot.headers,
        () => headers.refresh()
    );
    watch(
        (state) => state.snapshot.auth,
        () => auth.refresh()
    );
    watch(
        (state) => state.snapshot.bodyType,
        (bodyType) => {
            bodySelect.setValue(bodyType);
            beautify.classList.toggle('is-hidden', bodyType !== 'json');
            renderBody(bodyType);
        }
    );
    watch(
        (state) => ({
            body: state.snapshot.body,
            binaryPath: state.snapshot.binaryPath,
            formBody: state.snapshot.formBody,
            multipartBody: state.snapshot.multipartBody,
        }),
        () => bodyView?.sync()
    );
    watch(selectBadges, (counts) => {
        tabs.setBadge('params', counts.params > 0 ? String(counts.params) : null);
        tabs.setBadge('headers', counts.headers > 0 ? String(counts.headers) : null);
        tabs.setDot('body', counts.body);
        tabs.setDot('auth', counts.auth);
    });
    watch(
        (state) => state.activeRequestTab,
        (id) => {
            tabs.setActive(id);
            replace(content, panes[id] ?? panes.params);
        }
    );

    return el(
        'section',
        { class: 'panel request-panel' },
        el('div', { class: 'panel-head' }, tabs.root),
        content
    );
}
