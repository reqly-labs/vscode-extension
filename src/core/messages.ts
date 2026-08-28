import type { HttpResponse, RequestError, RequestSettings, RequestSnapshot } from './types';
import type { Variable } from './variables';

export interface WebviewState {
    snapshot: RequestSnapshot;
    settings: RequestSettings;
    activeRequestTab: string;
    activeResponseTab: string;
    activeRequestId: string | null;
}

export interface EnvironmentInfo {
    id: string | null;
    name: string;
    names: { id: string; name: string }[];
    variables: Variable[];
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
          name: 'send' | 'cancel' | 'save';
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
          type: 'manageEnvironments';
      };
