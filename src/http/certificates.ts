import * as tls from 'node:tls';

type CertificateSource = 'default' | 'system' | 'bundled' | 'extra';

let trusted: string[] | undefined;
let context: tls.SecureContext | undefined;

export function mergeCertificates(...sources: readonly (readonly string[])[]): string[] {
    const merged = new Set<string>();

    for (const source of sources) {
        for (const certificate of source) {
            const trimmed = certificate.trim();

            if (trimmed) {
                merged.add(trimmed);
            }
        }
    }

    return [...merged];
}

export function readCertificates(source: CertificateSource): readonly string[] {
    if (typeof tls.getCACertificates !== 'function') {
        return source === 'default' || source === 'bundled' ? tls.rootCertificates : [];
    }

    try {
        return tls.getCACertificates(source);
    } catch {
        return [];
    }
}

export function trustedCertificates(): string[] {
    trusted ??= mergeCertificates(
        readCertificates('default'),
        readCertificates('system'),
        readCertificates('extra')
    );

    return trusted;
}

export function trustedContext(): tls.SecureContext {
    context ??= tls.createSecureContext({ ca: trustedCertificates() });

    return context;
}
