import { flushPersist, post } from './bridge';
import { getState, mutate } from './store';

export const EMPTY_URL_MESSAGE = 'Enter a URL before sending the request.';

export function send(): void {
    const state = getState();

    if (state.loading) {
        return;
    }

    if (!state.snapshot.url.trim()) {
        post({ type: 'notify', level: 'warn', text: EMPTY_URL_MESSAGE });

        return;
    }

    const started = mutate((draft) => {
        draft.requestId += 1;
        draft.loading = true;
        draft.response = null;
        draft.error = null;

        return {
            requestId: draft.requestId,
            snapshot: draft.snapshot,
            settings: draft.settings,
        };
    });

    flushPersist();
    post({ type: 'send', ...started });
}

export function cancel(): void {
    if (!getState().loading) {
        return;
    }

    mutate((draft) => {
        draft.requestId += 1;
        draft.loading = false;
    });
    post({ type: 'cancel' });
}
