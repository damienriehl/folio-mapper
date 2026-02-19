import { useMemo } from 'react';

export function useTextDetection(text: string) {
  const itemCount = useMemo(() => {
    if (!text.trim()) return 0;
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
  }, [text]);

  const isTabular = useMemo(() => {
    if (!text.trim()) return false;
    return text.split('\n').some((line) => line.trim().length > 0 && line.includes('\t'));
  }, [text]);

  return { itemCount, isTabular };
}
