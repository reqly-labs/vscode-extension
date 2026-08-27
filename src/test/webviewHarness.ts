import { JSDOM } from 'jsdom';
import * as path from 'node:path';
import type { PanelMessage, WebviewState } from '../core/messages';
import { createSettings, createSnapshot, type RequestSnapshot } from '../core/types';
type StoreModule = typeof import('../webview/store');
type ActionsModule = typeof import('../webview/actions');
type UrlBarModule = typeof import('../webview/components/urlBar');
type RequestEditorModule = typeof import('../webview/components/requestEditor');
export interface WebviewHarness {
    window: JSDOM['window'];
    posted: PanelMessage[];
    store: StoreModule;
    actions: ActionsModule;
    createUrlBar: UrlBarModule['createUrlBar'];
    createRequestEditor: RequestEditorModule['createRequestEditor'];
    dispose(): void;
}
const WEBVIEW_ROOT = path.resolve(__dirname, '..', 'webview');
const BROWSER_GLOBALS = [
    'window',
    'document',
    'Event',
    'KeyboardEvent',
    'MouseEvent',
    'ClipboardEvent',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'getComputedStyle',
] as const;

function evictWebviewModules(): void {
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(WEBVIEW_ROOT)) {
            delete require.cache[key];
        }
    }
}
export function mountWebview(): WebviewHarness {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        pretendToBeVisual: true,
    });
    const globals = globalThis as Record<string, unknown>;
    const saved = new Map<string, unknown>();
    for (const name of BROWSER_GLOBALS) {
        saved.set(name, globals[name]);
        globals[name] = (dom.window as unknown as Record<string, unknown>)[name];
    }
    const posted: PanelMessage[] = [];
    saved.set('acquireVsCodeApi', globals.acquireVsCodeApi);
    globals.acquireVsCodeApi = () => ({
        postMessage: (message: PanelMessage) => posted.push(message),
        getState: () => undefined,
        setState: () => undefined,
    });
    evictWebviewModules();
    const store = require('../webview/store') as StoreModule;
    const actions = require('../webview/actions') as ActionsModule;
    const { createUrlBar } = require('../webview/components/urlBar') as UrlBarModule;
    const { createRequestEditor } =
        require('../webview/components/requestEditor') as RequestEditorModule;
    return {
        window: dom.window,
        posted,
        store,
        actions,
        createUrlBar,
        createRequestEditor,
        dispose() {
            for (const [name, value] of saved) {
                if (value === undefined) {
                    delete globals[name];
                } else {
                    globals[name] = value;
                }
            }
            evictWebviewModules();
            dom.window.close();
        },
    };
}
export function webviewState(
    snapshot: Partial<RequestSnapshot>,
    activeRequestId: string | null = null
): WebviewState {
    return {
        snapshot: { ...createSnapshot(), ...snapshot },
        settings: createSettings(),
        activeRequestTab: 'params',
        activeResponseTab: 'body',
        activeRequestId,
    };
}
export function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
