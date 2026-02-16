export type ExportFormat =
  | 'csv' | 'excel' | 'json'
  | 'rdf_turtle' | 'json_ld'
  | 'markdown' | 'html' | 'pdf';

export type ExportScope = 'mapped_only' | 'mapped_with_related' | 'full_ontology';

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string; mime: string }[] = [
  { value: 'csv',        label: 'CSV',         extension: '.csv',   mime: 'text/csv' },
  { value: 'excel',      label: 'Excel',       extension: '.xlsx',  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { value: 'json',       label: 'JSON',        extension: '.json',  mime: 'application/json' },
  { value: 'rdf_turtle', label: 'RDF/Turtle',  extension: '.ttl',   mime: 'text/turtle' },
  { value: 'json_ld',    label: 'JSON-LD',     extension: '.jsonld', mime: 'application/ld+json' },
  { value: 'markdown',   label: 'Markdown',    extension: '.md',    mime: 'text/markdown' },
  { value: 'html',       label: 'HTML Report', extension: '.html',  mime: 'text/html' },
  { value: 'pdf',        label: 'PDF',         extension: '.pdf',   mime: 'application/pdf' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'pt', name: 'Português' },
  { code: 'ar', name: 'العربية' },
  { code: 'ru', name: 'Русский' },
  { code: 'hi', name: 'हिन्दी' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export interface ExportOptions {
  format: ExportFormat;
  include_confidence: boolean;
  include_notes: boolean;
  include_reasoning: boolean;
  iri_format: 'hash' | 'full_url' | 'both';
  languages: LanguageCode[];
  include_hierarchy: boolean;
  export_scope: ExportScope;
}

export interface ExportRow {
  item_index: number;
  source_text: string;
  ancestry: string[];
  selected_concepts: ExportConcept[];
  note: string | null;
  status: string;
}

export interface ExportConcept {
  label: string;
  iri: string;
  iri_hash: string;
  branch: string;
  score: number;
  definition: string | null;
  translations: Record<string, string>;
  alternative_labels?: string[];
  examples?: string[];
  hierarchy_path?: string[];
  parent_iri_hash?: string | null;
  see_also?: string[];
  notes?: string | null;
  deprecated?: boolean;
  is_mapped?: boolean;
  mapping_source_text?: string | null;
  relationship?: string | null;
}

export interface ExportRequest {
  rows: ExportRow[];
  options: ExportOptions;
  source_file: string | null;
  session_created: string | null;
}

export interface ExportPreviewRow {
  source: string;
  label: string;
  iri: string;
  branch: string;
  confidence: number | null;
  note: string | null;
  translations: Record<string, string>;
}

export * from './api-client';
