import type { ParseItem } from '../input/types';
import type { BranchInfo, FolioStatus, MappingResponse } from './types';

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
