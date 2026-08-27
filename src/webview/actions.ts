import { flushPersist, post } from './bridge';
import { emit, state } from './store';
export const EMPTY_URL_MESSAGE = 'Enter a URL before sending the request.';

export function send(): void {
    if (state.loading) {
        return;
    }
    if (!state.snapshot.url.trim()) {
        post({ type: 'notify', level: 'warn', text: EMPTY_URL_MESSAGE });
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
export function cancel(): void {
    if (!state.loading) {
        return;
    }
    state.requestId += 1;
    state.loading = false;
    emit('response');
    post({ type: 'cancel' });
}
