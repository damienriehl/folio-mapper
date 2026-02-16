import type { MappingResponse } from '../folio/types';

export interface PreScanSegment {
  text: string;
  branches: string[];
  reasoning: string;
  synonyms?: string[];
}

export interface PreScanResult {
  segments: PreScanSegment[];
  raw_text: string;
}

export interface PipelineItemMetadata {
  item_index: number;
  item_text: string;
  prescan: PreScanResult;
  stage1_candidate_count: number;
  stage2_candidate_count: number;
  stage3_judged_count: number;
  stage3_boosted: number;
  stage3_penalized: number;
  stage3_rejected: number;
}

export interface PipelineResponse {
  mapping: MappingResponse;
  pipeline_metadata: PipelineItemMetadata[];
}
