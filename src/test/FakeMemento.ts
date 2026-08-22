export class FakeMemento {
    private data = new Map<string, string>();
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        const raw = this.data.get(key);
        return raw === undefined ? defaultValue : (JSON.parse(raw) as T);
    }
    keys(): readonly string[] {
        return [...this.data.keys()];
    }
    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.data.delete(key);
            return;
        }
        this.data.set(key, JSON.stringify(value));
    }
    setKeysForSync(): void {}
}
