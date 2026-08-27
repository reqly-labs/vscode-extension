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

export function formatJson(value: string): string {
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
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

export function prettyPrint(body: string, contentType: string): string {
    const type = contentType.toLowerCase();

    if (type.includes('json')) {
        return formatJson(body);
    }

    if (type.includes('xml') || type.includes('html')) {
        return formatXml(body);
    }

    return body;
}
