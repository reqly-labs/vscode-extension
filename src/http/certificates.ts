import { readFile } from 'node:fs/promises';
import * as tls from 'node:tls';

type CertificateSource = 'default' | 'system' | 'bundled' | 'extra';

let trusted: string[] | undefined;
let additional: string[] = [];

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
        readCertificates('extra'),
        additional
    );

    return trusted;
}

export function useAdditionalCertificates(certificates: readonly string[]): void {
    additional = mergeCertificates(certificates);
    trusted = undefined;
}

export async function readCertificateFiles(
    paths: readonly string[]
): Promise<{ certificates: string[]; failures: string[] }> {
    const certificates: string[] = [];
    const failures: string[] = [];

    for (const path of paths) {
        try {
            certificates.push(await readFile(path, 'utf8'));
        } catch {
            failures.push(path);
        }
    }

    return { certificates: mergeCertificates(certificates), failures };
}
