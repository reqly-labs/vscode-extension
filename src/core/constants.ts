export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const BODY_TYPES = ['none', 'json', 'text', 'xml', 'form', 'multipart', 'binary'] as const;

export const AUTH_TYPES = ['none', 'bearer', 'basic', 'api-key'] as const;

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_REDIRECTS = 10;

/**
 * Bodies larger than this are not shipped to the webview as text; the panel
 * shows a truncation notice instead so the editor never freezes on a huge
 * payload.
 */
export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
