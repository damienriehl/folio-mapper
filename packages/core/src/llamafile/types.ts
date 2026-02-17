export type LlamafileState =
  | 'idle'
  | 'preparing'
  | 'downloading-runtime'
  | 'downloading-model'
  | 'starting'
  | 'ready'
  | 'error';

export interface LlamafileStatus {
  state: LlamafileState;
  progress?: {
    bytesDownloaded: number;
    bytesTotal: number;
  };
  runtimeVersion?: string;
  modelName?: string;
  error?: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  filename: string;
  url: string;
  sizeBytes: number;
  description: string;
  recommended?: boolean;
}

export type ModelDownloadState = 'idle' | 'downloading' | 'complete' | 'error';

export interface ModelStatus {
  id: string;
  name: string;
  filename: string;
  description: string;
  sizeBytes: number;
  recommended?: boolean;
  downloaded: boolean;
  active: boolean;
  downloadState: ModelDownloadState;
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
  };
}
