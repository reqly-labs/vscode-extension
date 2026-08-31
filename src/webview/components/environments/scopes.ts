import type { EnvironmentInfo } from '../../../core/messages';
import type { Variable } from '../../../core/variables';
import type { Immutable } from '../../store';

export type ScopeKind = 'collection' | 'environment';

export interface Scope {
    kind: ScopeKind;
    id: string;
    name: string;
    variables: readonly Immutable<Variable>[];
}

export function readScopes(info: Immutable<EnvironmentInfo>): Scope[] {
    const scopes: Scope[] = [];

    if (info.collection) {
        scopes.push({
            kind: 'collection',
            id: info.collection.id,
            name: info.collection.name,
            variables: info.collection.variables,
        });
    }

    for (const environment of info.environments) {
        scopes.push({
            kind: 'environment',
            id: environment.id,
            name: environment.name,
            variables: environment.variables,
        });
    }

    return scopes;
}

export function findScope(scopes: Scope[], id: string | null): Scope | undefined {
    return scopes.find((scope) => scope.id === id) ?? scopes[0];
}

export function namedCount(scope: Scope): number {
    return scope.variables.filter((variable) => variable.key.trim()).length;
}
