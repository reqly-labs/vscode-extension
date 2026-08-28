import { randomBytes } from 'node:crypto';

const NONCE_BYTES = 24;

export function createNonce(): string {
    return randomBytes(NONCE_BYTES).toString('base64url');
}
