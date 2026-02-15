export interface SuggestionNearestCandidate {
  iri_hash: string;
  label: string;
  iri: string;
  branch: string;
  score: number;
}

export interface SuggestionEntry {
  id: string;
  item_index: number;
  original_input: string;
  full_input_context: string;
  suggested_label: string;
  suggested_definition: string;
  suggested_synonyms: string[];
  suggested_example: string;
  suggested_parent_class: string;
  suggested_branch: string;
  nearest_candidates: SuggestionNearestCandidate[];
  user_note: string;
  flagged_at: string; // ISO 8601
}
