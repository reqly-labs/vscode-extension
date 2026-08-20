import { escapeHtml } from './dom';

export type Language = 'json' | 'xml' | 'text';

const JSON_TOKEN =
    /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],])/g;

function highlightJson(source: string): string {
    let result = '';
    let last = 0;

    for (const match of source.matchAll(JSON_TOKEN)) {
        const index = match.index ?? 0;
        result += escapeHtml(source.slice(last, index));

        const [full, str, colon, num, literal, punct] = match;

        if (str !== undefined) {
            const cls = colon ? 'tok-key' : 'tok-string';
            result += `<span class="${cls}">${escapeHtml(str)}</span>`;
            result += colon ? `<span class="tok-punct">${escapeHtml(colon)}</span>` : '';
        } else if (num !== undefined) {
            result += `<span class="tok-number">${escapeHtml(num)}</span>`;
        } else if (literal !== undefined) {
            result += `<span class="tok-literal">${escapeHtml(literal)}</span>`;
        } else if (punct !== undefined) {
            result += `<span class="tok-punct">${escapeHtml(punct)}</span>`;
        }

        last = index + full.length;
    }

    return result + escapeHtml(source.slice(last));
}

const XML_TOKEN = /(<!--[\s\S]*?-->)|(<[?!/]?[\w:.-]+)|([\w:.-]+)(=)("[^"]*"|'[^']*')|(\/?>)/g;

function highlightXml(source: string): string {
    let result = '';
    let last = 0;

    for (const match of source.matchAll(XML_TOKEN)) {
        const index = match.index ?? 0;
        result += escapeHtml(source.slice(last, index));

        const [full, comment, tag, attr, equals, value, close] = match;

        if (comment !== undefined) {
            result += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
        } else if (tag !== undefined) {
            result += `<span class="tok-tag">${escapeHtml(tag)}</span>`;
        } else if (attr !== undefined) {
            result +=
                `<span class="tok-key">${escapeHtml(attr)}</span>` +
                `<span class="tok-punct">${escapeHtml(equals)}</span>` +
                `<span class="tok-string">${escapeHtml(value)}</span>`;
        } else if (close !== undefined) {
            result += `<span class="tok-tag">${escapeHtml(close)}</span>`;
        }

        last = index + full.length;
    }

    return result + escapeHtml(source.slice(last));
}

/**
 * Highlighting is skipped for very large payloads — the regex pass is linear
 * but the resulting DOM is not, and a multi-megabyte body would stall paint.
 */
const MAX_HIGHLIGHT_CHARS = 400_000;

export function highlight(source: string, language: Language): string {
    if (source.length > MAX_HIGHLIGHT_CHARS || language === 'text') {
        return escapeHtml(source);
    }

    return language === 'json' ? highlightJson(source) : highlightXml(source);
}

export function languageFor(contentType: string): Language {
    const type = contentType.toLowerCase();

    if (type.includes('json')) {
        return 'json';
    }

    if (type.includes('xml') || type.includes('html')) {
        return 'xml';
    }

    return 'text';
}
