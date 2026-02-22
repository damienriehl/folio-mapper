import type { EmbeddingStatus } from './types';

const BASE_URL = '/api/embedding';

export async function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  const res = await fetch(`${BASE_URL}/status`);

  if (!res.ok) {
    throw new Error(`Failed to fetch embedding status (${res.status})`);
  }

  return res.json();
}

export async function warmupEmbedding(): Promise<EmbeddingStatus> {
  const res = await fetch(`${BASE_URL}/warmup`, { method: 'POST' });

  if (!res.ok) {
    throw new Error(`Failed to warmup embedding index (${res.status})`);
  }

  return res.json();
}
