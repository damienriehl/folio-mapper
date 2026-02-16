import type { ParseResult } from '@folio-mapper/core';
import { FlatConfirmation } from './FlatConfirmation';
import { HierarchyConfirmation } from './HierarchyConfirmation';

interface ConfirmationScreenProps {
  result: ParseResult;
  onEdit: () => void;
  onContinue: () => void;
  onTreatAsFlat: () => void;
}

export function ConfirmationScreen({
  result,
  onEdit,
  onContinue,
  onTreatAsFlat,
}: ConfirmationScreenProps) {
  return (
    <div className="w-full max-w-2xl">
      <h2 className="mb-1 text-lg font-medium text-gray-900">Confirm your input</h2>
      {result.source_filename && (
        <p className="mb-4 text-sm text-gray-500">Source: {result.source_filename}</p>
      )}

      <div className="mb-6">
        {result.format === 'hierarchical' && result.hierarchy ? (
          <HierarchyConfirmation
            hierarchy={result.hierarchy}
            totalItems={result.total_items}
            onTreatAsFlat={onTreatAsFlat}
          />
        ) : (
          <FlatConfirmation items={result.items} totalItems={result.total_items} />
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={onContinue}
        >
          Continue &rarr;
        </button>
      </div>
    </div>
  );
}
