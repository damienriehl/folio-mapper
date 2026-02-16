import { useState, useCallback } from 'react';
import { generateIssueTitle, generateIssueBody } from '@folio-mapper/core';
import type { SubmissionMetadata } from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';
import { useLLMStore } from '../store/llm-store';

const ALEA_REPO_OWNER = 'alea-institute';
const ALEA_REPO_NAME = 'FOLIO';
const GITHUB_NEW_ISSUE_URL = `https://github.com/${ALEA_REPO_OWNER}/${ALEA_REPO_NAME}/issues/new`;

export function useSuggestionSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{ url: string; number: number } | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);

  const buildMetadata = useCallback((): SubmissionMetadata => {
    const mapping = useMappingStore.getState();
    const llm = useLLMStore.getState();
    const activeConfig = llm.configs[llm.activeProvider];

    // Count items with no selections as "no match"
    const noMatchCount = Object.entries(mapping.nodeStatuses).filter(
      ([idx]) => (mapping.selections[Number(idx)]?.length ?? 0) === 0,
    ).length;

    return {
      mapper_version: '0.1.0',
      folio_version: mapping.folioStatus.concept_count
        ? `${mapping.folioStatus.concept_count} concepts`
        : 'unknown',
      total_nodes: mapping.totalItems,
      no_match_count: noMatchCount,
      provider: llm.activeProvider,
      model: activeConfig?.model ?? null,
    };
  }, []);

  const getIssueContent = useCallback(() => {
    const queue = useMappingStore.getState().suggestionQueue;
    const metadata = buildMetadata();
    return {
      title: generateIssueTitle(queue),
      body: generateIssueBody(queue, metadata),
    };
  }, [buildMetadata]);

  const handleCopyAndOpen = useCallback(async () => {
    const { title, body } = getIssueContent();
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Fallback: select-and-copy not possible in all contexts, but try
    }
    const params = new URLSearchParams({ title, body });
    window.open(`${GITHUB_NEW_ISSUE_URL}?${params.toString()}`, '_blank');
  }, [getIssueContent]);

  const handleSubmitWithToken = useCallback(async (pat: string) => {
    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionResult(null);

    const { title, body } = getIssueContent();

    try {
      const response = await fetch('/api/github/submit-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pat,
          owner: ALEA_REPO_OWNER,
          repo: ALEA_REPO_NAME,
          title,
          body,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(data.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setSubmissionResult({ url: data.url, number: data.number });
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [getIssueContent]);

  const resetSubmission = useCallback(() => {
    setSubmissionResult(null);
    setSubmissionError(null);
  }, []);

  return {
    showSubmissionModal,
    setShowSubmissionModal,
    isSubmitting,
    submissionResult,
    submissionError,
    getIssueContent,
    handleCopyAndOpen,
    handleSubmitWithToken,
    resetSubmission,
  };
}
