import { useEffect, useRef } from 'react';

interface NewProjectModalProps {
  onSaveAndNew: () => void;
  onDiscardAndNew: () => void;
  onCancel: () => void;
}

export function NewProjectModal({
  onSaveAndNew,
  onDiscardAndNew,
  onCancel,
}: NewProjectModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Start new project">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Start New Project?</h2>
      <p className="mb-3 text-xs text-gray-500">
        Save your session before starting fresh?
      </p>

      <div className="flex flex-col gap-1.5">
        <button
          onClick={onSaveAndNew}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Save & Start New
        </button>
        <button
          onClick={onDiscardAndNew}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Discard & Start New
        </button>
        <button
          onClick={onCancel}
          className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
