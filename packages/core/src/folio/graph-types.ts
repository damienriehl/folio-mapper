export interface GraphNode {
  id: string;
  label: string;
  iri: string;
  definition: string | null;
  branch: string;
  branch_color: string;
  is_focus: boolean;
  is_branch_root: boolean;
  depth: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edge_type: 'subClassOf' | 'seeAlso';
  label: string | null;
}

export interface EntityGraphResponse {
  focus_iri_hash: string;
  focus_label: string;
  focus_branch: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  total_concept_count: number;
}
