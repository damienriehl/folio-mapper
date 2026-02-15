import type { ReactNode } from 'react';

interface InputScreenProps {
  textInput: ReactNode;
  fileDropZone: ReactNode;
  branchOptions?: ReactNode;
  error?: string | null;
}

export function InputScreen({ textInput, fileDropZone, branchOptions, error }: InputScreenProps) {
  return (
    <div className="w-full max-w-2xl space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Upload a file</h2>
        {fileDropZone}
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-sm text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Enter text directly</h2>
        {textInput}
      </div>

      {branchOptions}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
