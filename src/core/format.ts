export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms} ms`;
    }

    return `${(ms / 1000).toFixed(2)} s`;
}

export type BodyKind = 'json' | 'xml' | 'text';

const JSON_SNIFF_CHARS = 64 * 1024;

const JSON_WORD = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

const CLOSERS: Record<string, string> = { '{': '}', '[': ']' };

const lineBreaks: string[] = [];

function lineBreak(depth: number): string {
    return (lineBreaks[depth] ??= `\n${'  '.repeat(depth)}`);
}

function isSpace(char: string): boolean {
    return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}

function isWordChar(code: number): boolean {
    return (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        code === 43 ||
        code === 45 ||
        code === 46
    );
}

function skipSpace(source: string, from: number): number {
    let index = from;

    while (index < source.length && isSpace(source[index])) {
        index += 1;
    }

    return index;
}

function stringEnd(source: string, start: number): number {
    let index = start + 1;

    while (index < source.length) {
        const quote = source.indexOf('"', index);

        if (quote === -1) {
            return source.length;
        }

        let slashes = 0;

        while (source[quote - 1 - slashes] === '\\') {
            slashes += 1;
        }

        if (slashes % 2 === 0) {
            return quote + 1;
        }

        index = quote + 1;
    }

    return source.length;
}

function wordEnd(source: string, start: number): number {
    let index = start;

    while (index < source.length && isWordChar(source.charCodeAt(index))) {
        index += 1;
    }

    return index;
}

function reindentJson(source: string): string | null {
    const parts: string[] = [];
    const open: string[] = [];
    let index = 0;

    const startValue = () => {
        if (open.length === 0 && parts.length > 0) {
            parts.push('\n');
        }
    };

    while (index < source.length) {
        const char = source[index];

        if (isSpace(char)) {
            index += 1;
            continue;
        }

        if (char === '"') {
            const end = stringEnd(source, index);

            startValue();
            parts.push(source.slice(index, end));
            index = end;
            continue;
        }

        if (char === '{' || char === '[') {
            const closer = CLOSERS[char];
            const next = skipSpace(source, index + 1);

            startValue();
            if (source[next] === closer) {
                parts.push(char + closer);
                index = next + 1;
                continue;
            }

            open.push(closer);
            parts.push(char, lineBreak(open.length));
            index += 1;
            continue;
        }

        if (char === '}' || char === ']') {
            if (open.pop() !== char) {
                return null;
            }

            parts.push(lineBreak(open.length), char);
            index += 1;
            continue;
        }

        if (char === ',' || char === ':') {
            if (open.length === 0) {
                return null;
            }

            parts.push(char === ',' ? `,${lineBreak(open.length)}` : ': ');
            index += 1;
            continue;
        }

        const end = wordEnd(source, index);
        const word = source.slice(index, end);

        if (end === index || (end < source.length && !JSON_WORD.test(word))) {
            return null;
        }

        startValue();
        parts.push(word);
        index = end;
    }

    while (parts.length > 0 && parts[parts.length - 1].startsWith('\n')) {
        parts.pop();
    }

    return parts.join('');
}

export function formatJson(value: string): string {
    return reindentJson(value) ?? value;
}

export function looksLikeJson(body: string): boolean {
    const sample = body.slice(0, JSON_SNIFF_CHARS);
    const first = sample.trimStart()[0];

    return (first === '{' || first === '[') && reindentJson(sample) !== null;
}

export function bodyKind(body: string, contentType: string): BodyKind {
    const type = contentType.toLowerCase();

    if (type.includes('json')) {
        return 'json';
    }

    if (type.includes('xml') || type.includes('html')) {
        return 'xml';
    }

    return looksLikeJson(body) ? 'json' : 'text';
}

export function formatXml(value: string): string {
    const flat = value.replace(/>\s*</g, '><').trim();
    const lines: string[] = [];
    let depth = 0;

    for (const token of flat.split(/(<[^>]+>)/g)) {
        if (!token.trim()) {
            continue;
        }

        if (/^<\/[^>]+>$/.test(token)) {
            depth = Math.max(0, depth - 1);
            lines.push('  '.repeat(depth) + token);
            continue;
        }

        lines.push('  '.repeat(depth) + token);
        const opensScope =
            /^<[^!?/][^>]*>$/.test(token) && !/\/>$/.test(token) && !/^<\?/.test(token);

        if (opensScope) {
            depth += 1;
        }
    }

    return lines.join('\n');
}

export function prettyPrint(body: string, kind: BodyKind): string {
    if (kind === 'json') {
        return formatJson(body);
    }

    if (kind === 'xml') {
        return formatXml(body);
    }

    return body;
}
