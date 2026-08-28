import { createId } from '../core/types';
import {
    createEnvironment,
    emptyVariable,
    variableValues,
    type Environment,
    type Variable,
} from '../core/variables';
import { Emitter } from '../utils/Emitter';
import type { SecretStore } from './SecretStore';

export const ACTIVE_ENVIRONMENT_KEY = 'reqly.activeEnvironment';

export interface EnvironmentPersistence {
    load(): Promise<{ environments: Environment[]; unreadable: string[] }>;
    save(environments: readonly Environment[]): Promise<void>;
}

export interface ActiveEnvironmentStorage {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): PromiseLike<void>;
}

export function secretKey(environmentId: string, variableId: string): string {
    return `${environmentId}:${variableId}`;
}

export function collectEnvironmentSecrets(
    environments: readonly Environment[]
): Record<string, string> {
    const secrets: Record<string, string> = {};

    for (const environment of environments) {
        for (const variable of environment.variables) {
            if (variable.secret && variable.value) {
                secrets[secretKey(environment.id, variable.id)] = variable.value;
            }
        }
    }

    return secrets;
}

export function redactEnvironments(environments: readonly Environment[]): Environment[] {
    return environments.map((environment) => ({
        ...environment,
        variables: environment.variables.map((variable) =>
            variable.secret ? { ...variable, value: '' } : variable
        ),
    }));
}

export function restoreEnvironments(
    environments: readonly Environment[],
    secrets: Record<string, string>
): Environment[] {
    return environments.map((environment) => ({
        ...environment,
        variables: environment.variables.map((variable) =>
            variable.secret && !variable.value
                ? { ...variable, value: secrets[secretKey(environment.id, variable.id)] ?? '' }
                : variable
        ),
    }));
}

export class EnvironmentService {
    private state: Environment[] = [];
    private readonly changeEmitter = new Emitter<void>();
    private readonly secretFailureEmitter = new Emitter<void>();

    readonly onDidChange = this.changeEmitter.event;
    readonly onSecretsUnavailable = this.secretFailureEmitter.event;

    unreadableFiles: string[] = [];

    constructor(
        private readonly persistence: EnvironmentPersistence,
        private readonly memento: ActiveEnvironmentStorage,
        private readonly secrets?: SecretStore
    ) {}

    static async open(
        persistence: EnvironmentPersistence,
        memento: ActiveEnvironmentStorage,
        secrets?: SecretStore
    ): Promise<EnvironmentService> {
        const service = new EnvironmentService(persistence, memento, secrets);

        await service.reload();

        return service;
    }

    get environments(): readonly Environment[] {
        return this.state;
    }

    get activeId(): string | null {
        const stored = this.memento.get<string>(ACTIVE_ENVIRONMENT_KEY);

        return stored && this.state.some((entry) => entry.id === stored) ? stored : null;
    }

    get active(): Environment | undefined {
        const id = this.activeId;

        return id ? this.state.find((entry) => entry.id === id) : undefined;
    }

    get values(): Record<string, string> {
        return variableValues(this.active);
    }

    dispose(): void {
        this.changeEmitter.dispose();
        this.secretFailureEmitter.dispose();
    }

    async reload(): Promise<void> {
        const { environments, unreadable } = await this.persistence.load();

        this.unreadableFiles = unreadable;

        if (!this.secrets) {
            this.state = environments;
            this.changeEmitter.fire();

            return;
        }

        const exposed = collectEnvironmentSecrets(environments);
        const vault = await this.secrets.readEnvironments();

        this.state = restoreEnvironments(environments, { ...vault, ...exposed });

        if (Object.keys(exposed).length > 0) {
            await this.secrets.writeEnvironments(collectEnvironmentSecrets(this.state));
            await this.persistence.save(redactEnvironments(this.state));
        }

        this.changeEmitter.fire();
    }

    async setActive(id: string | null): Promise<void> {
        await this.memento.update(ACTIVE_ENVIRONMENT_KEY, id ?? undefined);
        this.changeEmitter.fire();
    }

    async create(name: string): Promise<Environment> {
        const environment = createEnvironment(name);

        await this.commit([...this.state, environment]);
        await this.setActive(environment.id);

        return environment;
    }

    async rename(id: string, name: string): Promise<void> {
        await this.commit(
            this.state.map((entry) =>
                entry.id === id
                    ? { ...entry, name: name.trim() || entry.name, updatedAt: Date.now() }
                    : entry
            )
        );
    }

    async duplicate(id: string): Promise<Environment | undefined> {
        const source = this.state.find((entry) => entry.id === id);

        if (!source) {
            return undefined;
        }

        const now = Date.now();
        const copy: Environment = {
            id: createId(),
            name: `${source.name} copy`,
            createdAt: now,
            updatedAt: now,
            variables: source.variables.map((variable) => ({ ...variable, id: createId() })),
        };
        const index = this.state.findIndex((entry) => entry.id === id);
        const next = [...this.state];

        next.splice(index + 1, 0, copy);
        await this.commit(next);

        return copy;
    }

    async remove(id: string): Promise<void> {
        await this.commit(this.state.filter((entry) => entry.id !== id));

        if (this.activeId === null) {
            await this.setActive(null);
        }
    }

    async replaceVariables(id: string, variables: Variable[]): Promise<void> {
        await this.commit(
            this.state.map((entry) =>
                entry.id === id ? { ...entry, variables, updatedAt: Date.now() } : entry
            )
        );
    }

    async addVariable(id: string): Promise<void> {
        const environment = this.state.find((entry) => entry.id === id);

        if (environment) {
            await this.replaceVariables(id, [...environment.variables, emptyVariable()]);
        }
    }

    private async commit(next: Environment[]): Promise<void> {
        this.state = next;

        if (this.secrets) {
            const secrets = collectEnvironmentSecrets(next);
            const stored = await this.secrets.writeEnvironments(secrets);

            if (!stored && Object.keys(secrets).length > 0) {
                this.secretFailureEmitter.fire();
            }
        }

        await this.persistence.save(this.secrets ? redactEnvironments(next) : next);
        this.changeEmitter.fire();
    }
}
