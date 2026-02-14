import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/tab-separated-values': ['.tsv'],
  'text/plain': ['.txt', '.md'],
};

interface FileDropZoneProps {
  onFile: (file: File) => void;
  isLoading: boolean;
  selectedFileName?: string | null;
}

export function FileDropZone({ onFile, isLoading, selectedFileName }: FileDropZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFile(accepted[0]);
      }
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: isLoading,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
      } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input {...getInputProps()} />
      {isLoading ? (
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-gray-600">Processing {selectedFileName}...</span>
        </div>
      ) : selectedFileName ? (
        <p className="text-sm text-gray-600">
          <span className="font-medium">{selectedFileName}</span> — drop another file to replace
        </p>
      ) : (
        <>
          <p className="mb-1 text-sm text-gray-600">
            {isDragActive ? (
              'Drop the file here...'
            ) : (
              <>
                <span className="font-medium text-blue-600">Click to browse</span> or drag and drop
              </>
            )}
          </p>
          <p className="text-xs text-gray-400">
            Supported: .xlsx, .csv, .tsv, .txt, .md (max 10MB)
          </p>
        </>
      )}
    </div>
  );
}
