import { useCallback } from 'react';
import { parseFile } from '@folio-mapper/core';
import { useInputStore } from '../store/input-store';

export function useFileUpload() {
  const { setSelectedFile, setParseResult, setLoading, setError } = useInputStore();

  const upload = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setLoading(true);

      try {
        const result = await parseFile(file);
        setParseResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [setSelectedFile, setLoading, setParseResult, setError],
  );

  return { upload };
}
