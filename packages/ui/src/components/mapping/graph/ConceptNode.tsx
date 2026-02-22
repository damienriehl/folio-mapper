import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface ConceptNodeData {
  label: string;
  branch: string;
  branch_color: string;
  is_focus: boolean;
  is_branch_root: boolean;
  is_focus_branch_root: boolean;
  definition: string | null;
  depth: number;
  [key: string]: unknown;
}

export type ConceptNodeType = Node<ConceptNodeData, 'concept'>;

export const ConceptNode = memo(({ data }: NodeProps<ConceptNodeType>) => {
  const { label, is_focus, is_branch_root, is_focus_branch_root, definition } = data;

  let className: string;
  let style: React.CSSProperties | undefined;

  if (is_focus) {
    // Focus concept: blue
    className = 'rounded-lg border-2 border-blue-400 bg-blue-50 px-3 py-1.5 text-blue-900 font-bold shadow-sm hover:shadow-md';
  } else if (is_branch_root && is_focus_branch_root) {
    // Focus concept's branch root: red
    className = 'rounded-lg border-[3px] border-red-500 bg-red-50 px-3 py-1.5 text-red-800 font-semibold shadow-sm hover:shadow-md';
  } else if (is_branch_root) {
    // Other branch roots: gray with thick outline
    className = 'rounded-lg border-[3px] border-gray-500 bg-gray-100 px-3 py-1.5 text-gray-700 font-semibold shadow-sm hover:shadow-md';
  } else {
    // Regular nodes
    className = 'rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-gray-800 shadow-sm hover:shadow-md';
  }

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" />
      <div
        className={`transition-shadow ${className}`}
        style={style}
        title={definition || label}
      >
        <span className="whitespace-nowrap text-xs">{label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-1.5 !h-1.5 !border-0" />
    </>
  );
});

ConceptNode.displayName = 'ConceptNode';
