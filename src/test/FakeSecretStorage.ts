export class FakeSecretStorage {
    private readonly data = new Map<string, string>();
    failing = false;
    async get(key: string): Promise<string | undefined> {
        this.guard();

        return this.data.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this.guard();
        this.data.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.guard();
        this.data.delete(key);
    }

    keys(): string[] {
        return [...this.data.keys()];
    }

    raw(): string {
        return JSON.stringify([...this.data.entries()]);
    }

    private guard(): void {
        if (this.failing) {
            throw new Error('the keychain is unavailable');
        }
    }
}
