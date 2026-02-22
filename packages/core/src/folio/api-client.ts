import type { ParseItem } from '../input/types';
import type { BranchInfo, ConceptDetail, FolioCandidate, FolioStatus, MandatoryFallbackResponse, MappingResponse } from './types';
import type { EntityGraphResponse } from './graph-types';
import type { PipelineRequestConfig } from '../pipeline/api-client';
import { buildAuthHeaders } from '../auth';

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

export async function fetchConceptDetail(iriHash: string): Promise<ConceptDetail> {
  const res = await fetch(`${BASE_URL}/concept/${encodeURIComponent(iriHash)}/detail`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Concept detail lookup failed' }));
    throw new Error(err.detail || `Concept detail lookup failed (${res.status})`);
  }

  return res.json();
}

export async function fetchEntityGraph(
  iriHash: string,
  options?: {
    ancestorsDepth?: number;
    descendantsDepth?: number;
    maxNodes?: number;
    includeSeeAlso?: boolean;
  },
): Promise<EntityGraphResponse> {
  const params = new URLSearchParams();
  if (options?.ancestorsDepth != null) params.set('ancestors_depth', String(options.ancestorsDepth));
  if (options?.descendantsDepth != null) params.set('descendants_depth', String(options.descendantsDepth));
  if (options?.maxNodes != null) params.set('max_nodes', String(options.maxNodes));
  if (options?.includeSeeAlso != null) params.set('include_see_also', String(options.includeSeeAlso));

  const qs = params.toString();
  const url = `${BASE_URL}/concept/${encodeURIComponent(iriHash)}/graph${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Graph fetch failed' }));
    throw new Error(err.detail || `Graph fetch failed (${res.status})`);
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
    headers: buildAuthHeaders(llmConfig?.api_key),
    body: JSON.stringify({
      item_text: itemText,
      item_index: itemIndex,
      branches,
      llm_config: llmConfig
        ? {
            provider: llmConfig.provider,
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
