interface ShortcutsOverlayProps {
  onClose: () => void;
}

const shortcuts = {
  navigation: [
    { keys: ['Enter', '\u2192'], description: 'Next item' },
    { keys: ['\u2190'], description: 'Previous item' },
    { keys: ['S'], description: 'Skip item' },
    { keys: ['G'], description: 'Go to item' },
    { keys: ['Shift', 'A'], description: 'Accept all defaults' },
    { keys: ['F'], description: 'Suggest to FOLIO' },
    { keys: ['R'], description: 'Flag for review' },
  ],
  general: [
    { keys: ['Ctrl', 'S'], description: 'Save session' },
    { keys: ['Ctrl', 'E'], description: 'Export mappings' },
    { keys: ['?'], description: 'Toggle shortcuts' },
    { keys: ['Esc'], description: 'Close dialog' },
  ],
};

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block min-w-[1.5rem] rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-center text-xs font-mono font-medium text-gray-700 shadow-sm">
      {children}
    </kbd>
  );
}

export function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-96 rounded-lg bg-white p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Keyboard Shortcuts</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Navigation</p>
            <ul className="space-y-2">
              {shortcuts.navigation.map((s) => (
                <li key={s.description} className="flex items-center gap-2">
                  <span className="flex gap-0.5">
                    {s.keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-0.5">
                        {i > 0 && <span className="text-xs text-gray-400">+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-gray-600">{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">General</p>
            <ul className="space-y-2">
              {shortcuts.general.map((s) => (
                <li key={s.description} className="flex items-center gap-2">
                  <span className="flex gap-0.5">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                  <span className="text-xs text-gray-600">{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
