import type { ParseItem } from '../input/types';
import type { PipelineResponse } from './types';
import { buildAuthHeaders } from '../auth';

const BASE_URL = '/api/pipeline';

export interface PipelineRequestConfig {
  provider: string;
  api_key: string | null;
  base_url: string | null;
  model: string | null;
}

export async function fetchPipelineCandidates(
  items: ParseItem[],
  llmConfig: PipelineRequestConfig,
  threshold = 0.3,
  maxPerBranch = 10,
): Promise<PipelineResponse> {
  const res = await fetch(`${BASE_URL}/map`, {
    method: 'POST',
    headers: buildAuthHeaders(llmConfig.api_key),
    body: JSON.stringify({
      items,
      llm_config: {
        provider: llmConfig.provider,
        base_url: llmConfig.base_url,
        model: llmConfig.model,
      },
      threshold,
      max_per_branch: maxPerBranch,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Pipeline mapping failed' }));
    throw new Error(err.detail || `Pipeline mapping failed (${res.status})`);
  }

  return res.json();
}
