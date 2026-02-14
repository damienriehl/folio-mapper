import type { ParseResult } from './types';

const BASE_URL = '/api/parse';

export async function parseFile(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/file`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

export async function parseText(text: string): Promise<ParseResult> {
  const res = await fetch(`${BASE_URL}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Parse failed' }));
    throw new Error(err.detail || `Parse failed (${res.status})`);
  }

  return res.json();
}
