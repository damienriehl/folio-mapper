import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';

export interface HierarchyEdgeData {
  edge_type: 'subClassOf' | 'seeAlso';
  label: string | null;
  [key: string]: unknown;
}

export type HierarchyEdgeType = Edge<HierarchyEdgeData, 'hierarchy'>;

export const HierarchyEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps<HierarchyEdgeType>) => {
    const isSeeAlso = data?.edge_type === 'seeAlso';

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: isSeeAlso ? '#8b5cf6' : '#3b82f6',
            strokeWidth: isSeeAlso ? 1.5 : 2,
            strokeDasharray: isSeeAlso ? '6 3' : undefined,
            opacity: isSeeAlso ? 0.7 : 0.6,
          }}
        />
        {isSeeAlso && data?.label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'all',
              }}
              className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 border border-purple-200"
            >
              {data.label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

HierarchyEdge.displayName = 'HierarchyEdge';
