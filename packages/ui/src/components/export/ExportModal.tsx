import { useState } from 'react';
import type { ExportFormat, ExportOptions, ExportPreviewRow, ExportScope, LanguageCode } from '@folio-mapper/core';
import { EXPORT_FORMATS, SUPPORTED_LANGUAGES } from '@folio-mapper/core';

interface ExportModalProps {
  totalItems: number;
  completedCount: number;
  onExport: (options: ExportOptions) => Promise<void>;
  onPreview: (options: ExportOptions) => Promise<ExportPreviewRow[]>;
  onClose: () => void;
  isExporting: boolean;
}

export function ExportModal({
  totalItems,
  completedCount,
  onExport,
  onPreview,
  onClose,
  isExporting,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exportScope, setExportScope] = useState<ExportScope>('mapped_only');
  const [includeConfidence, setIncludeConfidence] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [iriFormat, setIriFormat] = useState<'hash' | 'full_url' | 'both'>('hash');
  const [languages, setLanguages] = useState<LanguageCode[]>([]);
  const [preview, setPreview] = useState<ExportPreviewRow[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildOptions = (): ExportOptions => ({
    format,
    include_confidence: includeConfidence,
    include_notes: includeNotes,
    include_reasoning: false,
    iri_format: iriFormat,
    languages,
    include_hierarchy: true,
    export_scope: exportScope,
  });

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);
    try {
      const rows = await onPreview(buildOptions());
      setPreview(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    try {
      await onExport(buildOptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const toggleLanguage = (code: LanguageCode) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code],
    );
    setPreview(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Export Mappings</h2>
            <p className="text-sm text-gray-500">
              {completedCount} of {totalItems} items completed
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : `Export as ${EXPORT_FORMATS.find((f) => f.value === format)?.label}`}
            </button>
          </div>
        </div>

        {/* Format selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Format</label>
          <div className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setFormat(f.value); setPreview(null); }}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  format === f.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export scope */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Export Scope</label>
          <div className="flex flex-col gap-2">
            {([
              ['mapped_only', 'Mapped Only', 'Only concepts you selected during mapping'],
              ['mapped_with_related', 'Mapped + Related', 'Selected concepts plus siblings and ancestors'],
              ['full_ontology', 'Full Ontology', 'All ~18,323 FOLIO classes (mapped items denoted)'],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="radio"
                  name="export-scope"
                  checked={exportScope === val}
                  onChange={() => { setExportScope(val as ExportScope); setPreview(null); }}
                  className="mt-0.5 border-gray-300"
                />
                <span>
                  <span className="font-medium text-gray-700">{label}</span>
                  {' — '}{desc}
                </span>
              </label>
            ))}
          </div>
          {exportScope === 'full_ontology' && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
              Full ontology export includes ~18,323 concepts and may take several seconds.
            </div>
          )}
        </div>

        {/* Column options */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Columns</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeConfidence}
                onChange={(e) => { setIncludeConfidence(e.target.checked); setPreview(null); }}
                className="rounded border-gray-300"
              />
              Confidence scores
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => { setIncludeNotes(e.target.checked); setPreview(null); }}
                className="rounded border-gray-300"
              />
              Notes
            </label>
          </div>
        </div>

        {/* IRI format */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">IRI Format</label>
          <div className="flex gap-4">
            {([
              ['hash', 'Hash only'],
              ['full_url', 'Full URL'],
              ['both', 'Both'],
            ] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-1.5 text-sm text-gray-600">
                <input
                  type="radio"
                  name="iri-format"
                  checked={iriFormat === val}
                  onChange={() => { setIriFormat(val); setPreview(null); }}
                  className="border-gray-300"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Language selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Translation columns <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => toggleLanguage(lang.code)}
                className={`rounded-md border px-2.5 py-1 text-sm ${
                  languages.includes(lang.code)
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-4">
          <button
            onClick={handlePreview}
            disabled={isPreviewing}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {isPreviewing ? 'Loading preview...' : 'Preview (5 rows)'}
          </button>

          {preview && preview.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-1.5 text-left font-medium text-gray-600">Source</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-600">Label</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-600">IRI</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-600">Branch</th>
                    {includeConfidence && (
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">Conf.</th>
                    )}
                    {includeNotes && (
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">Notes</th>
                    )}
                    {languages.map((l) => (
                      <th key={l} className="px-3 py-1.5 text-left font-medium text-gray-600">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-gray-700">{row.source}</td>
                      <td className="px-3 py-1.5 text-gray-700">{row.label}</td>
                      <td className="max-w-[120px] truncate px-3 py-1.5 font-mono text-gray-500">{row.iri}</td>
                      <td className="px-3 py-1.5 text-gray-500">{row.branch}</td>
                      {includeConfidence && (
                        <td className="px-3 py-1.5 text-gray-500">
                          {row.confidence != null ? row.confidence.toFixed(1) : ''}
                        </td>
                      )}
                      {includeNotes && (
                        <td className="max-w-[120px] truncate px-3 py-1.5 text-gray-500">{row.note || ''}</td>
                      )}
                      {languages.map((l) => (
                        <td key={l} className="px-3 py-1.5 text-gray-500">
                          {row.translations?.[l] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
