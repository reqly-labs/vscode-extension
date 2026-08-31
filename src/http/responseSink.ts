import { randomBytes } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_PREVIEW_BYTES } from '../core/constants';

export interface CollectedBody {
    head: Buffer;
    size: number;
    spillPath: string | null;
}

export interface ResponseSink {
    readonly size: number;
    push(chunk: Buffer): boolean;
    onceDrained(listener: () => void): void;
    finish(): Promise<CollectedBody>;
    discard(): Promise<void>;
}

const SPILL_DIRECTORY = join(tmpdir(), 'reqly-responses');

const MAX_CHUNKS_IN_FLIGHT = 8;

function spillName(): string {
    return join(SPILL_DIRECTORY, `body-${randomBytes(8).toString('hex')}.bin`);
}

export async function removeSpill(path: string | null | undefined): Promise<void> {
    if (path) {
        await rm(path, { force: true });
    }
}

export function createResponseSink(headBytes = MAX_PREVIEW_BYTES): ResponseSink {
    const head: Buffer[] = [];
    const drainListeners: (() => void)[] = [];

    let headSize = 0;
    let total = 0;
    let spilling = false;
    let file: WriteStream | null = null;
    let path: string | null = null;
    let queue: Promise<void> = Promise.resolve();
    let inFlight = 0;
    let failure: Error | null = null;

    function open(): void {
        path = spillName();
        queue = queue
            .then(() => mkdir(SPILL_DIRECTORY, { recursive: true }))
            .then(() => {
                file = createWriteStream(path as string);
                file.on('error', (error: Error) => (failure ??= error));
            })
            .catch((error: Error) => {
                failure ??= error;
            });
    }

    function settle(): void {
        inFlight -= 1;
        if (inFlight === 0) {
            drainListeners.splice(0).forEach((listener) => listener());
        }
    }

    function writeToFile(chunk: Buffer): void {
        inFlight += 1;
        queue = queue.then(
            () =>
                new Promise<void>((resolve) => {
                    if (!file || failure) {
                        settle();
                        resolve();

                        return;
                    }

                    file.write(chunk, () => {
                        settle();
                        resolve();
                    });
                })
        );
    }

    return {
        get size() {
            return total;
        },

        push(chunk: Buffer) {
            total += chunk.byteLength;
            if (spilling) {
                writeToFile(chunk);

                return inFlight < MAX_CHUNKS_IN_FLIGHT;
            }

            if (headSize + chunk.byteLength <= headBytes) {
                head.push(chunk);
                headSize += chunk.byteLength;

                return true;
            }

            const room = headBytes - headSize;

            head.push(chunk.subarray(0, room));
            headSize += room;
            spilling = true;
            open();
            writeToFile(Buffer.concat(head));
            writeToFile(chunk.subarray(room));

            return inFlight < MAX_CHUNKS_IN_FLIGHT;
        },

        onceDrained(listener: () => void) {
            if (inFlight === 0) {
                listener();

                return;
            }

            drainListeners.push(listener);
        },

        async finish(): Promise<CollectedBody> {
            const buffered = Buffer.concat(head);

            if (!spilling) {
                return { head: buffered, size: total, spillPath: null };
            }

            await queue;
            if (file) {
                const writer = file;

                await new Promise<void>((resolve) => writer.end(() => resolve()));
            }

            if (failure || !path) {
                await removeSpill(path);

                return { head: buffered, size: total, spillPath: null };
            }

            return { head: buffered, size: total, spillPath: path };
        },

        async discard() {
            await queue.catch(() => undefined);
            file?.destroy();
            file = null;
            await removeSpill(path);
            path = null;
            spilling = false;
        },
    };
}
