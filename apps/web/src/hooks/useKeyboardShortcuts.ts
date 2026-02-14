import { useEffect, useState, useCallback } from 'react';
import { useMappingStore } from '../store/mapping-store';

/**
 * Keyboard shortcuts for the mapping screen.
 * Enter=Next, S=Skip, Shift+A=Accept All, G=GoTo, ArrowLeft=Prev
 */
export function useKeyboardShortcuts(active: boolean) {
  const { nextItem, prevItem, skipItem, acceptAllDefaults, goToItem, totalItems } =
    useMappingStore();
  const [showGoToDialog, setShowGoToDialog] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      // Don't intercept if user is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          nextItem();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevItem();
          break;
        case 's':
        case 'S':
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            skipItem();
          }
          break;
        case 'A':
          if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            acceptAllDefaults();
          }
          break;
        case 'g':
        case 'G':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setShowGoToDialog(true);
          }
          break;
        case 'Escape':
          setShowGoToDialog(false);
          break;
      }
    },
    [active, nextItem, prevItem, skipItem, acceptAllDefaults],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleGoTo = useCallback(
    (index: number) => {
      goToItem(index);
      setShowGoToDialog(false);
    },
    [goToItem],
  );

  return { showGoToDialog, setShowGoToDialog, handleGoTo, totalItems };
}
