export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const BODY_TYPES = ['none', 'json', 'text', 'xml', 'form', 'multipart', 'binary'] as const;

export const AUTH_TYPES = ['none', 'bearer', 'basic', 'api-key'] as const;

export const DEFAULT_TIMEOUT_MS = 30000;

export const MAX_REDIRECTS = 10;

export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
