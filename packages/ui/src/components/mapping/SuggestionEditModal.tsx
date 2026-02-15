import { useState } from 'react';
import type { SuggestionEntry } from '@folio-mapper/core';
import { BRANCH_COLORS } from '@folio-mapper/core';

interface SuggestionEditModalProps {
  entry: SuggestionEntry;
  onSave: (id: string, updates: Partial<SuggestionEntry>) => void;
  onClose: () => void;
}

const BRANCH_NAMES = Object.values(BRANCH_COLORS).map((b) => b.name).sort();

export function SuggestionEditModal({
  entry,
  onSave,
  onClose,
}: SuggestionEditModalProps) {
  const [label, setLabel] = useState(entry.suggested_label);
  const [definition, setDefinition] = useState(entry.suggested_definition);
  const [synonymsText, setSynonymsText] = useState(entry.suggested_synonyms.join(', '));
  const [example, setExample] = useState(entry.suggested_example);
  const [parentClass, setParentClass] = useState(entry.suggested_parent_class);
  const [branch, setBranch] = useState(entry.suggested_branch);
  const [note, setNote] = useState(entry.user_note);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(entry.id, {
      suggested_label: label.trim(),
      suggested_definition: definition.trim(),
      suggested_synonyms: synonymsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      suggested_example: example.trim(),
      suggested_parent_class: parentClass.trim(),
      suggested_branch: branch,
      user_note: note.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit suggestion"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Edit Suggestion</h3>

        {/* Read-only context */}
        <div className="mb-4 rounded border border-gray-100 bg-gray-50 p-2">
          <p className="text-[10px] font-semibold uppercase text-gray-400">Original Input</p>
          <p className="text-xs text-gray-700">{entry.original_input}</p>
          {entry.full_input_context !== entry.original_input && (
            <>
              <p className="mt-1 text-[10px] font-semibold uppercase text-gray-400">Context</p>
              <p className="text-xs text-gray-600">{entry.full_input_context}</p>
            </>
          )}
          {entry.nearest_candidates.length > 0 && (
            <>
              <p className="mt-1 text-[10px] font-semibold uppercase text-gray-400">Nearest Candidates</p>
              <ul className="space-y-0.5">
                {entry.nearest_candidates.map((c) => (
                  <li key={c.iri_hash} className="text-xs text-gray-600">
                    {c.label} <span className="text-gray-400">({c.branch}, {c.score}%)</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-label">
              Suggested Label (rdfs:label)
            </label>
            <input
              id="sug-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-def">
              Definition (skos:definition)
            </label>
            <textarea
              id="sug-def"
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-syn">
              Synonyms (skos:altLabel, comma-separated)
            </label>
            <input
              id="sug-syn"
              type="text"
              value={synonymsText}
              onChange={(e) => setSynonymsText(e.target.value)}
              placeholder="e.g. Term A, Term B"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-example">
              Example (skos:example)
            </label>
            <textarea
              id="sug-example"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-parent">
              Suggested Parent Class
            </label>
            <input
              id="sug-parent"
              type="text"
              value={parentClass}
              onChange={(e) => setParentClass(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-branch">
              Suggested Branch
            </label>
            <select
              id="sug-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            >
              <option value="">Select branch...</option>
              {BRANCH_NAMES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700" htmlFor="sug-note">
              Use Case / Note
            </label>
            <textarea
              id="sug-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
