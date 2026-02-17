import type { ExportFormat, ExportScope, LanguageCode } from '@folio-mapper/core';
import { EXPORT_FORMATS, SUPPORTED_LANGUAGES } from '@folio-mapper/core';

interface ExportOptionsBarProps {
  format: ExportFormat;
  exportScope: ExportScope;
  includeConfidence: boolean;
  includeNotes: boolean;
  iriFormat: 'hash' | 'full_url' | 'both';
  languages: LanguageCode[];
  includeTreeSection: boolean;
  includeTableSection: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onScopeChange: (scope: ExportScope) => void;
  onIncludeConfidenceChange: (v: boolean) => void;
  onIncludeNotesChange: (v: boolean) => void;
  onIriFormatChange: (v: 'hash' | 'full_url' | 'both') => void;
  onLanguagesChange: (langs: LanguageCode[]) => void;
  onIncludeTreeSectionChange: (v: boolean) => void;
  onIncludeTableSectionChange: (v: boolean) => void;
  totalConcepts: number;
  branchCount: number;
}

export function ExportOptionsBar({
  format,
  exportScope,
  includeConfidence,
  includeNotes,
  iriFormat,
  languages,
  includeTreeSection,
  includeTableSection,
  onFormatChange,
  onScopeChange,
  onIncludeConfidenceChange,
  onIncludeNotesChange,
  onIriFormatChange,
  onLanguagesChange,
  onIncludeTreeSectionChange,
  onIncludeTableSectionChange,
  totalConcepts,
  branchCount,
}: ExportOptionsBarProps) {
  const toggleLanguage = (code: LanguageCode) => {
    onLanguagesChange(
      languages.includes(code) ? languages.filter((l) => l !== code) : [...languages, code],
    );
  };

  return (
    <div className="space-y-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
      {/* Row 1: Format + Scope + Stats */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Format</span>
          <div className="flex flex-wrap gap-1">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => onFormatChange(f.value)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  format === f.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Scope</span>
          {([
            ['mapped_only', 'Mapped'],
            ['mapped_with_related', 'Related'],
            ['full_ontology', 'Full'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onScopeChange(val as ExportScope)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                exportScope === val
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
              title={val === 'mapped_only' ? 'Mapped Only' : val === 'mapped_with_related' ? 'Mapped + Related' : 'Full Ontology'}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <span className="text-xs text-gray-500">
          {totalConcepts} concepts in {branchCount} branches
        </span>
      </div>

      {/* Row 2: Column toggles + IRI + Languages + HTML toggles */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500">Columns</span>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={includeConfidence}
              onChange={(e) => onIncludeConfidenceChange(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300"
            />
            Confidence
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => onIncludeNotesChange(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300"
            />
            Notes
          </label>
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">IRI</span>
          {([
            ['hash', 'Hash'],
            ['full_url', 'Full'],
            ['both', 'Both'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onIriFormatChange(val)}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                iriFormat === val
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500">Languages</span>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => toggleLanguage(lang.code)}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                languages.includes(lang.code)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {lang.code}
            </button>
          ))}
        </div>

        {format === 'html' && (
          <>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500">HTML Sections</span>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={includeTreeSection}
                  onChange={(e) => onIncludeTreeSectionChange(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-300"
                />
                Tree
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={includeTableSection}
                  onChange={(e) => onIncludeTableSectionChange(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-300"
                />
                Table
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
