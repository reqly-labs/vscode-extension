import './styles.css';

import type { HostMessage } from '../core/messages';
import { flushPersist, post } from './bridge';
import { createRequestEditor } from './components/requestEditor';
import { createResponseView } from './components/responseView';
import { createSplitView } from './components/splitView';
import { createUrlBar } from './components/urlBar';
import { el, replace } from './dom';
import { emit, hydrate, state } from './store';

const root = document.getElementById('root') as HTMLElement;

function send(): void {
    if (state.loading) {
        return;
    }

    if (!state.snapshot.url.trim()) {
        post({ type: 'notify', level: 'warn', text: 'Enter a URL before sending the request.' });
        return;
    }

    state.requestId += 1;
    state.loading = true;
    state.response = null;
    state.error = null;
    emit('response');
    flushPersist();

    post({
        type: 'send',
        requestId: state.requestId,
        snapshot: state.snapshot,
        settings: state.settings,
    });
}

function cancel(): void {
    if (!state.loading) {
        return;
    }

    state.requestId += 1;
    state.loading = false;
    emit('response');
    post({ type: 'cancel' });
}

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
    const urlBar = createUrlBar({ onSend: send, onCancel: cancel });
    const split = createSplitView(createRequestEditor(), createResponseView());

    replace(root, buildTopBar(mascotUri), urlBar, split);
    emit('response');
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'init':
            hydrate(message.state);
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
            mount(message.mascotUri);
            break;

        case 'theme':
            document.documentElement.classList.toggle('reqly-dark', message.theme === 'dark');
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
    const sendCombo = (event.ctrlKey || event.metaKey) && event.key === 'Enter';

    if (sendCombo) {
        event.preventDefault();
        send();
    }
});

post({ type: 'ready' });
