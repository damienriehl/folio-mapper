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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Start New Project?</h2>
        <p className="mb-6 text-sm text-gray-600">
          You have an active session. Would you like to save it before starting fresh?
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndNew}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save & Start New
          </button>
          <button
            onClick={onDiscardAndNew}
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Discard & Start New
          </button>
          <button
            onClick={onCancel}
            className="w-full rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
