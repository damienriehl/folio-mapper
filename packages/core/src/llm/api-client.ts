import type { ConnectionTestResponse, LLMProviderType, ModelInfo } from './types';
import { buildAuthHeaders } from '../auth';

const BASE_URL = '/api/llm';

export async function testConnection(
  provider: LLMProviderType,
  apiKey?: string,
  baseUrl?: string,
  model?: string,
): Promise<ConnectionTestResponse> {
  const res = await fetch(`${BASE_URL}/test-connection`, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify({
      provider,
      base_url: baseUrl || null,
      model: model || null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Connection test failed' }));
    throw new Error(err.detail || `Connection test failed (${res.status})`);
  }

  return res.json();
}

export async function fetchKnownModels(): Promise<Record<string, ModelInfo[]>> {
  const res = await fetch(`${BASE_URL}/known-models`);
  if (!res.ok) {
    throw new Error('Failed to fetch known models');
  }
  return res.json();
}

export async function fetchModels(
  provider: LLMProviderType,
  apiKey?: string,
  baseUrl?: string,
): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify({
      provider,
      base_url: baseUrl || null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch models' }));
    throw new Error(err.detail || `Failed to fetch models (${res.status})`);
  }

  return res.json();
}
