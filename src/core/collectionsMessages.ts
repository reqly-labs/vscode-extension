import type { HttpMethod } from './types';
import type { NodeKind } from './workspace';
export interface TreeRow {
    id: string;
    kind: NodeKind;
    name: string;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    childCount: number;
    method?: HttpMethod;
    url?: string;
    isActive: boolean;
}
export interface TreeStats {
    collections: number;
    requests: number;
}
export type CollectionsHostMessage =
    | {
          type: 'render';
          rows: TreeRow[];
          stats: TreeStats;
          mascotUri: string;
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
export type CollectionsViewMessage =
    | {
          type: 'ready';
      }
    | {
          type: 'open';
          id: string;
      }
    | {
          type: 'toggle';
          id: string;
      }
    | {
          type: 'newCollection';
      }
    | {
          type: 'newFolder';
          id: string;
      }
    | {
          type: 'newRequest';
          id: string | null;
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
          type: 'delete';
          id: string;
      }
    | {
          type: 'move';
          id: string;
          targetId: string | null;
      }
    | {
          type: 'openRepository';
      };
