import { useMemo } from 'react';

export function useTextDetection(text: string) {
  const itemCount = useMemo(() => {
    if (!text.trim()) return 0;
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
  }, [text]);

  return { itemCount };
}
