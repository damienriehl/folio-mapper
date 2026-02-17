export interface ExportTreeConcept {
  label: string;
  iri: string;
  iri_hash: string;
  branch: string;
  score: number;
  definition: string | null;
  translations: Record<string, string>;
  alternative_labels: string[];
  examples: string[];
  hierarchy_path: string[];
  hierarchy_path_entries: Array<{ label: string; iri_hash: string }>;
  is_mapped: boolean;
  relationship: string | null;
  notes: string | null;
  deprecated: boolean;
}

export interface ExportTreeBranch {
  branch: string;
  branch_color: string;
  concepts: ExportTreeConcept[];
}

export interface ExportTreeData {
  branches: ExportTreeBranch[];
  total_concepts: number;
  mapped_count: number;
  ancestor_metadata: Record<string, ExportTreeConcept>;
}
