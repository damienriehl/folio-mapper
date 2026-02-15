import { useState } from 'react';

interface GoToDialogProps {
  totalItems: number;
  onGoTo: (index: number) => void;
  onClose: () => void;
}

export function GoToDialog({ totalItems, onGoTo, onClose }: GoToDialogProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(value, 10);
    if (num >= 1 && num <= totalItems) {
      onGoTo(num - 1); // Convert 1-based to 0-based
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-72 rounded-lg bg-white p-4 shadow-lg" role="dialog" aria-modal="true" aria-label="Go to node" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-medium text-gray-900">Go to node</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            min={1}
            max={totalItems}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`1 - ${totalItems}`}
            className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              Go
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
