import type { HttpResponse, RequestError, RequestSettings, RequestSnapshot } from './types';

export interface WebviewState {
    snapshot: RequestSnapshot;
    settings: RequestSettings;
    activeRequestTab: string;
    activeResponseTab: string;
}

export type HostMessage =
    | { type: 'init'; state: WebviewState; mascotUri: string; theme: 'light' | 'dark' }
    | { type: 'theme'; theme: 'light' | 'dark' }
    | { type: 'sending' }
    | { type: 'response'; requestId: number; response: HttpResponse }
    | { type: 'error'; requestId: number; error: RequestError }
    | { type: 'filePicked'; target: 'multipart' | 'binary'; fieldId: string; path: string }
    | { type: 'command'; name: 'send' | 'cancel' };

export type PanelMessage =
    | { type: 'ready' }
    | { type: 'send'; requestId: number; snapshot: RequestSnapshot; settings: RequestSettings }
    | { type: 'cancel' }
    | { type: 'persist'; state: WebviewState }
    | { type: 'copy'; text: string; label: string }
    | { type: 'pickFile'; target: 'multipart' | 'binary'; fieldId: string }
    | { type: 'saveResponse'; fileName: string }
    | { type: 'openExternal'; url: string }
    | { type: 'notify'; level: 'info' | 'warn' | 'error'; text: string };
