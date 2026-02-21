import { buildAuthHeaders } from '../auth';

const BASE_URL = '/api/synthetic';

export interface SyntheticRequestConfig {
  provider: string;
  api_key: string | null;
  base_url: string | null;
  model: string | null;
}

export interface SyntheticResponse {
  text: string;
  item_count: number;
}

export async function fetchSyntheticData(
  count: number,
  llmConfig: SyntheticRequestConfig,
): Promise<SyntheticResponse> {
  const res = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: buildAuthHeaders(llmConfig.api_key),
    body: JSON.stringify({
      count,
      llm_config: {
        provider: llmConfig.provider,
        base_url: llmConfig.base_url,
        model: llmConfig.model,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Synthetic generation failed' }));
    throw new Error(err.detail || `Synthetic generation failed (${res.status})`);
  }

  return res.json();
}
