import type { HttpResponse, RequestError, RequestSettings, RequestSnapshot } from './types';
import type { Environment, Variable } from './variables';

export interface WebviewState {
    snapshot: RequestSnapshot;
    settings: RequestSettings;
    activeRequestTab: string;
    activeResponseTab: string;
    activeRequestId: string | null;
}

export interface CollectionScope {
    id: string;
    name: string;
    variables: Variable[];
}

export interface EnvironmentInfo {
    activeId: string | null;
    environments: Environment[];
    collection: CollectionScope | null;
    dynamic: { name: string; description: string }[];
}

export interface ActiveRequestInfo {
    id: string | null;
    name: string;
    location: string;
}

export type HostMessage =
    | {
          type: 'init';
          state: WebviewState;
          mascotUri: string;
          theme: 'light' | 'dark';
          active: ActiveRequestInfo;
          environment: EnvironmentInfo;
      }
    | {
          type: 'theme';
          theme: 'light' | 'dark';
      }
    | {
          type: 'loadRequest';
          state: WebviewState;
          active: ActiveRequestInfo;
      }
    | {
          type: 'activeChanged';
          active: ActiveRequestInfo;
      }
    | {
          type: 'environment';
          environment: EnvironmentInfo;
      }
    | {
          type: 'saved';
          active: ActiveRequestInfo;
      }
    | {
          type: 'response';
          requestId: number;
          response: HttpResponse;
      }
    | {
          type: 'error';
          requestId: number;
          error: RequestError;
      }
    | {
          type: 'filePicked';
          target: 'multipart' | 'binary';
          fieldId: string;
          path: string;
      }
    | {
          type: 'command';
          name: 'send' | 'cancel' | 'save' | 'environments';
      };

export type PanelMessage =
    | {
          type: 'ready';
      }
    | {
          type: 'send';
          requestId: number;
          snapshot: RequestSnapshot;
          settings: RequestSettings;
      }
    | {
          type: 'cancel';
      }
    | {
          type: 'persist';
          state: WebviewState;
      }
    | {
          type: 'save';
          snapshot: RequestSnapshot;
      }
    | {
          type: 'saveAs';
          snapshot: RequestSnapshot;
      }
    | {
          type: 'copy';
          text: string;
          label: string;
      }
    | {
          type: 'pickFile';
          target: 'multipart' | 'binary';
          fieldId: string;
      }
    | {
          type: 'saveResponse';
          fileName: string;
      }
    | {
          type: 'openExternal';
          url: string;
      }
    | {
          type: 'notify';
          level: 'info' | 'warn' | 'error';
          text: string;
      }
    | {
          type: 'selectEnvironment';
          id: string | null;
      }
    | {
          type: 'createEnvironment';
          name: string;
      }
    | {
          type: 'renameEnvironment';
          id: string;
          name: string;
      }
    | {
          type: 'duplicateEnvironment';
          id: string;
      }
    | {
          type: 'removeEnvironment';
          id: string;
      }
    | {
          type: 'saveVariables';
          id: string;
          variables: Variable[];
      }
    | {
          type: 'saveCollectionVariables';
          id: string;
          variables: Variable[];
      };
