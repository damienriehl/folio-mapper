import type { ExportRequest, ExportPreviewRow } from './index';

const BASE_URL = '/api/export';

export async function fetchExport(request: ExportRequest): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(err.detail || `Export failed (${res.status})`);
  }

  return res.blob();
}

export async function fetchExportPreview(
  request: ExportRequest,
): Promise<ExportPreviewRow[]> {
  const res = await fetch(`${BASE_URL}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Preview failed' }));
    throw new Error(err.detail || `Preview failed (${res.status})`);
  }

  return res.json();
}

export async function fetchTranslations(
  iri_hashes: string[],
  languages: string[],
): Promise<Record<string, Record<string, string>>> {
  const res = await fetch(`${BASE_URL}/translations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iri_hashes, languages }),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch translations');
  }

  return res.json();
}
