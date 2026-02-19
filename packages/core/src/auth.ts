/**
 * Auth header utilities for API requests.
 *
 * API keys travel via Authorization: Bearer header (not in request body).
 * GitHub PATs travel via X-GitHub-Pat header.
 */

export function buildAuthHeaders(apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export function buildGitHubHeaders(pat: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-GitHub-Pat': pat,
  };
}
