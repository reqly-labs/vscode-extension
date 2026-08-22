export interface Unsubscribe {
    dispose(): void;
}
export type Subscribe<T> = (listener: (value: T) => void) => Unsubscribe;
export class Emitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    readonly event: Subscribe<T> = (listener) => {
        this.listeners.add(listener);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    };
    fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }
    dispose(): void {
        this.listeners.clear();
    }
}
