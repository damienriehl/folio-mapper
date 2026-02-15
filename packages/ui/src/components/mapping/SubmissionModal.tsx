import { useState } from 'react';

interface SubmissionModalProps {
  issueTitle: string;
  issueBody: string;
  onCopyAndOpen: () => void;
  onSubmitWithToken: (pat: string) => Promise<void>;
  submissionResult: { url: string; number: number } | null;
  submissionError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
}

export function SubmissionModal({
  issueTitle,
  issueBody,
  onCopyAndOpen,
  onSubmitWithToken,
  submissionResult,
  submissionError,
  isSubmitting,
  onClose,
}: SubmissionModalProps) {
  const [tab, setTab] = useState<'preview' | 'submit'>('preview');
  const [pat, setPat] = useState('');

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) return;
    await onSubmitWithToken(pat.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Submit suggestions to ALEA"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 pt-4 pb-3">
          <h3 className="text-sm font-semibold text-gray-900">Submit to ALEA Institute</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-4 py-2 text-xs font-medium ${
              tab === 'preview'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setTab('submit')}
            className={`px-4 py-2 text-xs font-medium ${
              tab === 'submit'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Submit
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'preview' && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-700">Issue Title:</p>
              <p className="mb-3 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-800">
                {issueTitle}
              </p>
              <p className="mb-2 text-xs font-medium text-gray-700">Issue Body (Markdown):</p>
              <pre className="max-h-96 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                {issueBody}
              </pre>
            </div>
          )}

          {tab === 'submit' && (
            <div className="space-y-5">
              {submissionResult && (
                <div className="rounded border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-medium text-green-800">
                    Issue created successfully!
                  </p>
                  <a
                    href={submissionResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-700 underline"
                  >
                    View Issue #{submissionResult.number}
                  </a>
                </div>
              )}

              {submissionError && (
                <div className="rounded border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-700">{submissionError}</p>
                </div>
              )}

              {/* Manual option */}
              <div className="rounded border border-gray-200 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-700">Option 1: Copy & Open GitHub</p>
                <p className="mb-2 text-xs text-gray-500">
                  Copies the issue body to your clipboard and opens the GitHub new issue page.
                </p>
                <button
                  type="button"
                  onClick={onCopyAndOpen}
                  className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
                >
                  Copy & Open GitHub
                </button>
              </div>

              {/* Token option */}
              <div className="rounded border border-gray-200 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-700">Option 2: Submit with GitHub Token</p>
                <p className="mb-2 text-xs text-gray-500">
                  Provide a GitHub Personal Access Token with <code className="rounded bg-gray-100 px-1">public_repo</code> scope.
                  The token is only used for this request and is not stored.
                </p>
                <form onSubmit={handleTokenSubmit} className="flex gap-2">
                  <input
                    type="password"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="ghp_..."
                    disabled={isSubmitting}
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                    aria-label="GitHub Personal Access Token"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !pat.trim()}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </form>
              </div>

              {/* Alternative */}
              <p className="text-xs text-gray-400">
                Alternatively, discuss suggestions on the{' '}
                <a
                  href="https://discourse.openlegalstandard.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline"
                >
                  FOLIO community forum
                </a>.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
