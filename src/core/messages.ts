import type { HttpResponse, RequestError, RequestSettings, RequestSnapshot } from './types';

export interface WebviewState {
    snapshot: RequestSnapshot;
    settings: RequestSettings;
    activeRequestTab: string;
    activeResponseTab: string;
}

/** Messages sent from the extension host down to the panel. */
export type HostMessage =
    | { type: 'init'; state: WebviewState; mascotUri: string; theme: 'light' | 'dark' }
    | { type: 'theme'; theme: 'light' | 'dark' }
    | { type: 'sending' }
    | { type: 'response'; requestId: number; response: HttpResponse }
    | { type: 'error'; requestId: number; error: RequestError }
    | { type: 'filePicked'; target: 'multipart' | 'binary'; fieldId: string; path: string }
    | { type: 'command'; name: 'send' | 'cancel' };

/** Messages sent from the panel up to the extension host. */
export type PanelMessage =
    | { type: 'ready' }
    | { type: 'send'; requestId: number; snapshot: RequestSnapshot; settings: RequestSettings }
    | { type: 'cancel' }
    | { type: 'persist'; state: WebviewState }
    | { type: 'copy'; text: string; label: string }
    | { type: 'pickFile'; target: 'multipart' | 'binary'; fieldId: string }
    /** The host still holds the raw bytes, so the panel only names the file. */
    | { type: 'saveResponse'; fileName: string }
    | { type: 'openExternal'; url: string }
    | { type: 'notify'; level: 'info' | 'warn' | 'error'; text: string };
