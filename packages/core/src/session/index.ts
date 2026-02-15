import type { ParseResult, Screen } from '../input/types';
import type { MappingResponse } from '../folio/types';
import type { BranchState, BranchSortMode, NodeStatus, StatusFilter } from '../mapping/types';
import type { PipelineItemMetadata } from '../pipeline/types';
import type { SuggestionEntry } from '../suggestion/types';

export const SESSION_VERSION = '1.2';

export interface SessionFile {
  // Metadata
  version: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  source_file: string | null;
  input_format: string | null;
  total_nodes: number;
  completed: number;
  skipped: number;
  current_position: number;

  // LLM context
  provider: string | null;
  model: string | null;

  // Reconstructable state
  text_input: string;
  parse_result: ParseResult | null;
  mapping_response: MappingResponse | null;
  pipeline_metadata: PipelineItemMetadata[] | null;

  // User progress
  selections: Record<number, string[]>;
  node_statuses: Record<number, NodeStatus>;
  notes: Record<number, string>;
  screen: Screen;

  // Preferences
  branch_states: Record<string, BranchState>;
  input_branch_states: Record<string, BranchState>;
  branch_sort_mode: BranchSortMode;
  custom_branch_order: string[];
  status_filter: StatusFilter;

  // Suggestion queue
  suggestion_queue: SuggestionEntry[];
}

export function validateSession(data: unknown): SessionFile | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // Required fields check
  if (typeof d.version !== 'string') return null;
  if (typeof d.created !== 'string') return null;
  if (typeof d.updated !== 'string') return null;
  if (typeof d.total_nodes !== 'number') return null;
  if (typeof d.screen !== 'string') return null;

  // Must have a valid screen value
  if (!['input', 'confirming', 'mapping'].includes(d.screen as string)) return null;

  return d as unknown as SessionFile;
}

export interface SessionSummary {
  created: string;
  totalNodes: number;
  completed: number;
  skipped: number;
}

export function sessionSummary(session: SessionFile): SessionSummary {
  return {
    created: session.created,
    totalNodes: session.total_nodes,
    completed: session.completed,
    skipped: session.skipped,
  };
}
