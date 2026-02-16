export type NodeStatus = 'pending' | 'completed' | 'skipped';

export type StatusFilter = 'all' | 'pending' | 'completed' | 'skipped' | 'needs_attention';

export type BranchState = 'normal' | 'mandatory' | 'excluded';

export type BranchSortMode = 'default' | 'alphabetical' | 'custom';

export interface MappingSelection {
  itemIndex: number;
  selectedIriHashes: string[];
  status: NodeStatus;
}
