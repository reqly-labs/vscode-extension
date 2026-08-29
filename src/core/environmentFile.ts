import type { Environment, Variable } from './variables';

export const ENVIRONMENT_FILE_VERSION = 1;

export interface EnvironmentDocument {
    reqly: number;
    order: number;
    environment: Environment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toVariable(raw: Record<string, unknown>, index: number): Variable {
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `v${index}`,
        key: typeof raw.key === 'string' ? raw.key : '',
        value: typeof raw.value === 'string' ? raw.value : '',
        enabled: raw.enabled !== false,
        secret: raw.secret === true,
    };
}

export function toEnvironmentDocument(
    environment: Environment,
    order: number
): EnvironmentDocument {
    return { reqly: ENVIRONMENT_FILE_VERSION, order, environment };
}

export function parseEnvironmentDocument(
    raw: unknown
): { environment: Environment; order: number } | null {
    if (!isRecord(raw) || !isRecord(raw.environment)) {
        return null;
    }

    const source = raw.environment;

    if (typeof source.id !== 'string' || !source.id) {
        return null;
    }

    const createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now();
    const variables = Array.isArray(source.variables) ? source.variables : [];

    return {
        order: typeof raw.order === 'number' ? raw.order : 0,
        environment: {
            id: source.id,
            name: typeof source.name === 'string' && source.name ? source.name : 'Environment',
            createdAt,
            updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : createdAt,
            variables: variables.filter(isRecord).map(toVariable),
        },
    };
}
