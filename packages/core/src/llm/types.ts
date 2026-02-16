export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'meta_llama'
  | 'ollama'
  | 'lmstudio'
  | 'custom'
  | 'groq'
  | 'xai'
  | 'github_models';

export type ConnectionStatus = 'untested' | 'valid' | 'invalid';

export interface LLMProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  connectionStatus: ConnectionStatus;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_window: number | null;
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  model: string | null;
}

export interface ProviderMeta {
  type: LLMProviderType;
  displayName: string;
  defaultBaseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  isLocal: boolean;
}
