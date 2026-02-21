import { useState } from 'react';

interface SyntheticDataPanelProps {
  llmConnected: boolean;
  isGenerating: boolean;
  onGenerate: (count: number) => void;
  onOpenSettings: () => void;
}

export function SyntheticDataPanel({
  llmConnected,
  isGenerating,
  onGenerate,
  onOpenSettings,
}: SyntheticDataPanelProps) {
  const [count, setCount] = useState(10);

  return (
    <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-800">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Generate Sample Data
      </div>

      {llmConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 whitespace-nowrap">
              Items: <span className="font-medium text-gray-800">{count}</span>
            </label>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-blue-200 accent-blue-600"
              disabled={isGenerating}
            />
          </div>
          <button
            onClick={() => onGenerate(count)}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            LLM not connected.{' '}
            <button
              onClick={onOpenSettings}
              className="text-blue-600 underline hover:text-blue-800"
            >
              Configure an LLM provider
            </button>{' '}
            to generate sample data.
          </p>
        </div>
      )}
    </div>
  );
}
