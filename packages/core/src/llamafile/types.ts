export type LlamafileState =
  | 'idle'
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
