import { escapeHtml } from './dom';
import { findVariableTokens } from '../core/variables';

export type Language = 'json' | 'xml' | 'text';

export interface HighlightOptions {
    variables?: boolean;
}

function paint(source: string, variables: boolean): string {
    if (!variables || !source.includes('{{')) {
        return escapeHtml(source);
    }

    const tokens = findVariableTokens(source);

    if (tokens.length === 0) {
        return escapeHtml(source);
    }

    let result = '';
    let cursor = 0;

    for (const token of tokens) {
        result += escapeHtml(source.slice(cursor, token.start));
        result += `<span class="variable-token">${escapeHtml(token.text)}</span>`;
        cursor = token.end;
    }

    return result + escapeHtml(source.slice(cursor));
}

const JSON_TOKEN =
    /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],])/g;

function highlightJson(source: string, variables: boolean): string {
    let result = '';
    let last = 0;

    for (const match of source.matchAll(JSON_TOKEN)) {
        const index = match.index ?? 0;

        result += paint(source.slice(last, index), variables);
        const [full, str, colon, num, literal, punct] = match;

        if (str !== undefined) {
            const cls = colon ? 'tok-key' : 'tok-string';

            result += `<span class="${cls}">${paint(str, variables)}</span>`;
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

    return result + paint(source.slice(last), variables);
}

const XML_TOKEN = /(<!--[\s\S]*?-->)|(<[?!/]?[\w:.-]+)|([\w:.-]+)(=)("[^"]*"|'[^']*')|(\/?>)/g;

function highlightXml(source: string, variables: boolean): string {
    let result = '';
    let last = 0;

    for (const match of source.matchAll(XML_TOKEN)) {
        const index = match.index ?? 0;

        result += paint(source.slice(last, index), variables);
        const [full, comment, tag, attr, equals, value, close] = match;

        if (comment !== undefined) {
            result += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
        } else if (tag !== undefined) {
            result += `<span class="tok-tag">${escapeHtml(tag)}</span>`;
        } else if (attr !== undefined) {
            result +=
                `<span class="tok-key">${escapeHtml(attr)}</span>` +
                `<span class="tok-punct">${escapeHtml(equals)}</span>` +
                `<span class="tok-string">${paint(value, variables)}</span>`;
        } else if (close !== undefined) {
            result += `<span class="tok-tag">${escapeHtml(close)}</span>`;
        }

        last = index + full.length;
    }

    return result + paint(source.slice(last), variables);
}

const MAX_HIGHLIGHT_CHARS = 400000;

export function highlight(
    source: string,
    language: Language,
    options: HighlightOptions = {}
): string {
    const variables = options.variables === true;

    if (source.length > MAX_HIGHLIGHT_CHARS) {
        return escapeHtml(source);
    }

    if (language === 'text') {
        return paint(source, variables);
    }

    return language === 'json' ? highlightJson(source, variables) : highlightXml(source, variables);
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
