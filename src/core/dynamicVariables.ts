export interface DynamicVariable {
    name: string;
    description: string;
}

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const DYNAMIC_VARIABLES: readonly DynamicVariable[] = [
    { name: '$guid', description: 'A random UUID v4' },
    { name: '$uuid', description: 'A random UUID v4' },
    { name: '$timestamp', description: 'The current time in Unix seconds' },
    { name: '$isoTimestamp', description: 'The current time as an ISO 8601 string' },
    { name: '$randomInt', description: 'A whole number between 0 and 1000' },
    { name: '$randomAlphaNumeric', description: 'A random letter or digit' },
];

const NAMES = new Set(DYNAMIC_VARIABLES.map((entry) => entry.name));

function randomInt(bound: number): number {
    const source = globalThis.crypto;

    if (source && typeof source.getRandomValues === 'function') {
        return source.getRandomValues(new Uint32Array(1))[0] % bound;
    }

    return Math.floor(Math.random() * bound);
}

function uuid(): string {
    const source = globalThis.crypto;

    if (source && typeof source.randomUUID === 'function') {
        return source.randomUUID();
    }

    const bytes = new Uint8Array(16);

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = randomInt(256);
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isDynamicVariable(name: string): boolean {
    return NAMES.has(name);
}

export function dynamicVariableNames(): string[] {
    return DYNAMIC_VARIABLES.map((entry) => entry.name);
}

export function resolveDynamicVariable(name: string): string | undefined {
    switch (name) {
        case '$guid':
        case '$uuid':
            return uuid();
        case '$timestamp':
            return String(Math.floor(Date.now() / 1000));
        case '$isoTimestamp':
            return new Date().toISOString();
        case '$randomInt':
            return String(randomInt(1001));
        case '$randomAlphaNumeric':
            return ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
        default:
            return undefined;
    }
}
