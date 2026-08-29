import type { HostMessage } from '../core/messages';
import { cancel, send } from './actions';
import { flushPersist, post } from './bridge';
import { createEnvironmentDialog } from './components/environmentDialog';
import { createRequestEditor } from './components/requestEditor';
import { createRequestHeader, requestSave } from './components/requestHeader';
import { createResponseView } from './components/responseView';
import { createSplitView } from './components/splitView';
import { createUrlBar } from './components/urlBar';
import { el, replace } from './dom';
import { emit, hydrate, markSaved, setActive, setEnvironment, state } from './store';
import './styles.css';

const root = document.getElementById('root') as HTMLElement;

let openEnvironments: () => void = () => {};

function buildTopBar(mascotUri: string): HTMLElement {
    return el(
        'header',
        { class: 'topbar' },
        el(
            'div',
            { class: 'brand' },
            el('img', { class: 'brand-mark', src: mascotUri, alt: '' }),
            el(
                'span',
                { class: 'brand-text' },
                el('span', { class: 'brand-name', text: 'Reqly' }),
                el('span', { class: 'brand-tagline', text: 'API Client' })
            )
        ),
        el('span', {
            class: 'topbar-hint',
            text: 'Paste a cURL command into the URL field to import it',
        })
    );
}

function mount(mascotUri: string): void {
    const dialog = createEnvironmentDialog();

    openEnvironments = dialog.open;

    const header = createRequestHeader({
        onSave: requestSave,
        onManageEnvironments: dialog.open,
    });
    const urlBar = createUrlBar({ onSend: send, onCancel: cancel });
    const split = createSplitView(createRequestEditor(), createResponseView());

    replace(root, buildTopBar(mascotUri), header, urlBar, split, dialog.root);
    emit('response', 'active');
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'init':
            state.environment = message.environment;
            hydrate(message.state, message.active);
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
            mount(message.mascotUri);
            break;
        case 'theme':
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
            break;
        case 'loadRequest':
            state.response = null;
            state.error = null;
            state.loading = false;
            hydrate(message.state, message.active);
            break;
        case 'activeChanged':
            setActive(message.active);
            break;
        case 'environment':
            setEnvironment(message.environment);
            break;
        case 'saved':
            markSaved();
            setActive(message.active);
            break;
        case 'response':
            if (message.requestId !== state.requestId) {
                return;
            }

            state.loading = false;
            state.error = null;
            state.response = message.response;
            emit('response');
            break;
        case 'error':
            if (message.requestId !== state.requestId) {
                return;
            }

            state.loading = false;
            state.response = null;
            state.error = message.error;
            emit('response');
            break;
        case 'command':
            if (message.name === 'send') {
                send();
            } else if (message.name === 'save') {
                requestSave();
            } else if (message.name === 'environments') {
                openEnvironments();
            } else {
                cancel();
            }

            break;
        case 'filePicked':
            if (message.target === 'binary') {
                state.snapshot.binaryPath = message.path;
            } else {
                const field = state.snapshot.multipartBody.find(
                    (entry) => entry.id === message.fieldId
                );

                if (field) {
                    field.filePath = message.path;
                }
            }

            emit('body');
            flushPersist();
            break;
    }
});
window.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.key === 'Enter') {
        event.preventDefault();
        send();

        return;
    }

    if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        requestSave();
    }
});
post({ type: 'ready' });
