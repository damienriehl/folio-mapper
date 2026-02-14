export interface FolioCandidate {
  label: string;
  iri: string;
  iri_hash: string;
  definition: string | null;
  synonyms: string[];
  branch: string;
  branch_color: string;
  hierarchy_path: string[];
  score: number; // 0-100
}

export interface BranchGroup {
  branch: string;
  branch_color: string;
  candidates: FolioCandidate[];
}

export interface ItemMappingResult {
  item_index: number;
  item_text: string;
  branch_groups: BranchGroup[];
  total_candidates: number;
}

export interface BranchInfo {
  name: string;
  color: string;
  concept_count: number;
}

export interface MappingResponse {
  items: ItemMappingResult[];
  total_items: number;
  branches_available: BranchInfo[];
}

export interface FolioStatus {
  loaded: boolean;
  concept_count: number;
  loading: boolean;
  error: string | null;
}
