import type { ParseItem } from '../input/types';
import type { BranchInfo, FolioCandidate, FolioStatus, MandatoryFallbackResponse, MappingResponse } from './types';
import type { PipelineRequestConfig } from '../pipeline/api-client';

const BASE_URL = '/api/mapping';

export async function fetchCandidates(
  items: ParseItem[],
  threshold = 0.3,
  maxPerBranch = 10,
): Promise<MappingResponse> {
  const res = await fetch(`${BASE_URL}/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      threshold,
      max_per_branch: maxPerBranch,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Candidate search failed' }));
    throw new Error(err.detail || `Candidate search failed (${res.status})`);
  }

  return res.json();
}

export async function fetchFolioStatus(): Promise<FolioStatus> {
  const res = await fetch(`${BASE_URL}/status`);

  if (!res.ok) {
    throw new Error(`Failed to fetch FOLIO status (${res.status})`);
  }

  return res.json();
}

export async function warmupFolio(): Promise<FolioStatus> {
  const res = await fetch(`${BASE_URL}/warmup`, { method: 'POST' });

  if (!res.ok) {
    throw new Error(`Failed to warmup FOLIO (${res.status})`);
  }

  return res.json();
}

export async function fetchBranches(): Promise<BranchInfo[]> {
  const res = await fetch(`${BASE_URL}/branches`);

  if (!res.ok) {
    throw new Error(`Failed to fetch branches (${res.status})`);
  }

  return res.json();
}

export async function fetchConcept(iriHash: string): Promise<FolioCandidate> {
  const res = await fetch(`${BASE_URL}/concept/${encodeURIComponent(iriHash)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Concept lookup failed' }));
    throw new Error(err.detail || `Concept lookup failed (${res.status})`);
  }

  return res.json();
}

export async function fetchMandatoryFallback(
  itemText: string,
  itemIndex: number,
  branches: string[],
  llmConfig?: PipelineRequestConfig | null,
): Promise<MandatoryFallbackResponse> {
  const res = await fetch(`${BASE_URL}/mandatory-fallback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_text: itemText,
      item_index: itemIndex,
      branches,
      llm_config: llmConfig
        ? {
            provider: llmConfig.provider,
            api_key: llmConfig.api_key,
            base_url: llmConfig.base_url,
            model: llmConfig.model,
          }
        : null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Mandatory fallback failed' }));
    throw new Error(err.detail || `Mandatory fallback failed (${res.status})`);
  }

  return res.json();
}
