export type NodeStatus = 'pending' | 'completed' | 'skipped';

export interface MappingSelection {
  itemIndex: number;
  selectedIriHashes: string[];
  status: NodeStatus;
}
