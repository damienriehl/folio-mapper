import { useEffect, useState, useCallback } from 'react';
import { useMappingStore } from '../store/mapping-store';

/**
 * Keyboard shortcuts for the mapping screen.
 * Enter/ArrowRight=Next, ArrowLeft=Prev, S=Skip, Shift+A=Accept All,
 * G=GoTo, ?=Shortcuts, Ctrl+E=Export, Esc=Close
 */
export function useKeyboardShortcuts(active: boolean, onExport?: () => void, onSuggest?: () => void) {
  const { nextItem, prevItem, skipItem, acceptAllDefaults, goToItem, totalItems } =
    useMappingStore();
  const [showGoToDialog, setShowGoToDialog] = useState(false);
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      // Don't intercept if user is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+E for export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        onExport?.();
        return;
      }

      switch (e.key) {
        case 'Enter':
        case 'ArrowRight':
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
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            onSuggest?.();
          }
          break;
        case '?':
          e.preventDefault();
          setShowShortcutsOverlay((prev) => !prev);
          break;
        case 'Escape':
          setShowGoToDialog(false);
          setShowShortcutsOverlay(false);
          break;
      }
    },
    [active, nextItem, prevItem, skipItem, acceptAllDefaults, onExport, onSuggest],
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

  return { showGoToDialog, setShowGoToDialog, handleGoTo, totalItems, showShortcutsOverlay, setShowShortcutsOverlay };
}
