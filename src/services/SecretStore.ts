const WORKSPACE_KEY = 'reqly.secrets';
const DRAFT_KEY = 'reqly.draftSecret';
export interface SecretStorageLike {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
}
function isRecordOfStrings(value: unknown): value is Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === 'string');
}
export class SecretStore {
    constructor(private readonly storage: SecretStorageLike) {}
    async readWorkspace(): Promise<Record<string, string>> {
        const raw = await this.get(WORKSPACE_KEY);
        if (!raw) {
            return {};
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            return isRecordOfStrings(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    async writeWorkspace(secrets: Record<string, string>): Promise<boolean> {
        if (Object.keys(secrets).length === 0) {
            return this.remove(WORKSPACE_KEY);
        }
        return this.set(WORKSPACE_KEY, JSON.stringify(secrets));
    }
    async readDraft(): Promise<string> {
        return (await this.get(DRAFT_KEY)) ?? '';
    }
    async writeDraft(secret: string): Promise<boolean> {
        if (!secret) {
            return this.remove(DRAFT_KEY);
        }
        return this.set(DRAFT_KEY, secret);
    }
    async clear(): Promise<void> {
        await this.remove(WORKSPACE_KEY);
        await this.remove(DRAFT_KEY);
    }
    private async get(key: string): Promise<string | undefined> {
        try {
            return await this.storage.get(key);
        } catch {
            return undefined;
        }
    }
    private async set(key: string, value: string): Promise<boolean> {
        try {
            await this.storage.store(key, value);
            return true;
        } catch {
            return false;
        }
    }
    private async remove(key: string): Promise<boolean> {
        try {
            await this.storage.delete(key);
            return true;
        } catch {
            return false;
        }
    }
}
