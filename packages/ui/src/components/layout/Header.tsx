type LLMStatus = 'connected' | 'disconnected' | 'none';

interface HeaderProps {
  onOpenSettings?: () => void;
  onSaveSession?: () => void;
  onNewProject?: () => void;
  onRestart?: () => void;
  onOpenExport?: () => void;
  hasActiveSession?: boolean;
  llmStatus?: LLMStatus;
  llmProviderLabel?: string;
}

export function Header({ onOpenSettings, onSaveSession, onNewProject, onRestart, onOpenExport, hasActiveSession, llmStatus, llmProviderLabel }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-xl font-semibold text-gray-900">FOLIO Mapper</h1>
      <div className="flex items-center gap-1">
        {onRestart && (
          <button
            onClick={onRestart}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Restart — clear session and start over"
            aria-label="Restart"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h5"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.93 9A8 8 0 1121 12"
              />
            </svg>
            Restart
          </button>
        )}
        {hasActiveSession && onSaveSession && (
          <button
            onClick={onSaveSession}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Save Session (Ctrl+S)"
            aria-label="Save session"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h4l2 2h4a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v4h6V3"
              />
              <rect x="8" y="13" width="8" height="4" rx="0.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Save
          </button>
        )}
        {/* Export button moved to MappingToolbar (amber style, next to Mappings).
           Ctrl+E shortcut still works. Uncomment to restore header Export:
        {hasActiveSession && onOpenExport && (
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Export (Ctrl+E)"
            aria-label="Export"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v10m0 0l3-3m-3 3l-3-3" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Export
          </button>
        )}
        */}
        {hasActiveSession && onNewProject && (
          <button
            onClick={onNewProject}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Start New Project"
            aria-label="New project"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </button>
        )}
        {llmStatus === 'connected' && (
          <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400" title={llmProviderLabel ? `Connected to ${llmProviderLabel}` : 'LLM connected'}>
            <span className="h-2 w-2 rounded-full bg-green-500" />
            LLM
          </span>
        )}
        {llmStatus === 'disconnected' && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600" title={llmProviderLabel ? `${llmProviderLabel} disconnected` : 'LLM disconnected'}>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            LLM Disconnected
          </span>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="LLM Settings"
            aria-label="LLM settings"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
