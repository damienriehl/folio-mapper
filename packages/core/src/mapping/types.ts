export type NodeStatus = 'pending' | 'completed' | 'skipped';

export type BranchState = 'normal' | 'mandatory' | 'excluded';

export type BranchSortMode = 'default' | 'alphabetical' | 'custom';

export interface MappingSelection {
  itemIndex: number;
  selectedIriHashes: string[];
  status: NodeStatus;
}
