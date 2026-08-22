import type { HttpMethod } from './types';
import type { NodeKind } from './workspace';

/**
 * A single rendered line of the collections tree.
 *
 * The host flattens the tree into these rows, honouring the current expansion
 * state, so the sidebar webview renders a plain list and never walks the tree
 * itself. Keeping all structural reasoning on the host side means the view
 * cannot derive a wrong parent, because it derives nothing.
 */
export interface TreeRow {
    id: string;
    kind: NodeKind;
    name: string;
    /** Indentation level, zero at the root. */
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    /** Number of direct children, shown on groups. */
    childCount: number;
    /** Present only on requests. */
    method?: HttpMethod;
    url?: string;
    /** True for the request currently open in the panel. */
    isActive: boolean;
}

export type CollectionsHostMessage =
    | { type: 'render'; rows: TreeRow[]; theme: 'light' | 'dark' }
    | { type: 'theme'; theme: 'light' | 'dark' }
    /** Puts a row into inline edit mode, used right after creating something. */
    | { type: 'beginRename'; id: string };

export type CollectionsViewMessage =
    | { type: 'ready' }
    | { type: 'open'; id: string }
    | { type: 'toggle'; id: string }
    | { type: 'newCollection' }
    | { type: 'newFolder'; id: string }
    | { type: 'newRequest'; id: string | null }
    | { type: 'rename'; id: string; name: string }
    | { type: 'duplicate'; id: string }
    | { type: 'delete'; id: string }
    | { type: 'move'; id: string; targetId: string | null };
