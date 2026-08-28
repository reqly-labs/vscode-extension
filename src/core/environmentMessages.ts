import type { Environment, Variable } from './variables';

export interface EnvironmentRow {
    id: string;
    name: string;
    variableCount: number;
    active: boolean;
}

export interface EnvironmentView {
    rows: EnvironmentRow[];
    selectedId: string | null;
    variables: Variable[];
}

export type EnvironmentHostMessage =
    | {
          type: 'render';
          view: EnvironmentView;
          theme: 'light' | 'dark';
      }
    | {
          type: 'theme';
          theme: 'light' | 'dark';
      }
    | {
          type: 'beginRename';
          id: string;
      };

export type EnvironmentViewMessage =
    | {
          type: 'ready';
      }
    | {
          type: 'select';
          id: string;
      }
    | {
          type: 'activate';
          id: string | null;
      }
    | {
          type: 'create';
      }
    | {
          type: 'rename';
          id: string;
          name: string;
      }
    | {
          type: 'duplicate';
          id: string;
      }
    | {
          type: 'remove';
          id: string;
      }
    | {
          type: 'saveVariables';
          id: string;
          variables: Variable[];
      };

export function toRows(
    environments: readonly Environment[],
    activeId: string | null
): EnvironmentRow[] {
    return environments.map((environment) => ({
        id: environment.id,
        name: environment.name,
        variableCount: environment.variables.filter(
            (variable) => variable.enabled && variable.key.trim()
        ).length,
        active: environment.id === activeId,
    }));
}
