import { useCallback, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { EntityGraphResponse } from '@folio-mapper/core';
import type { ConceptNodeData } from './ConceptNode';
import type { HierarchyEdgeData } from './HierarchyEdge';

export type LayoutDirection = 'TB' | 'LR';

interface LayoutResult {
  nodes: Node<ConceptNodeData>[];
  edges: Edge<HierarchyEdgeData>[];
  isLayouting: boolean;
  runLayout: (data: EntityGraphResponse, direction?: LayoutDirection) => Promise<void>;
}

// Estimated node dimensions for ELK (will be refined by React Flow)
const NODE_WIDTH = 180;
const NODE_HEIGHT = 36;

export function useELKLayout(): LayoutResult {
  const [nodes, setNodes] = useState<Node<ConceptNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<HierarchyEdgeData>[]>([]);
  const [isLayouting, setIsLayouting] = useState(false);

  const runLayout = useCallback(
    async (data: EntityGraphResponse, direction: LayoutDirection = 'TB') => {
      setIsLayouting(true);

      try {
        // Dynamic import to code-split elkjs (~600KB)
        const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
        const elk = new ELK();

        // Convert backend data to ELK format
        const elkNodes = data.nodes.map((n) => ({
          id: n.id,
          width: Math.max(NODE_WIDTH, n.label.length * 7.5 + 32),
          height: NODE_HEIGHT,
        }));

        const elkEdges = data.edges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        }));

        const elkGraph = await elk.layout({
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '70',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.edgeRouting': 'SPLINES',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
          },
          children: elkNodes,
          edges: elkEdges,
        });

        // Map ELK positions back to React Flow nodes
        const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
        const layoutedNodes: Node<ConceptNodeData>[] = (elkGraph.children ?? []).map(
          (elkNode) => {
            const backendNode = nodeMap.get(elkNode.id)!;
            return {
              id: elkNode.id,
              type: 'concept',
              position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
              data: {
                label: backendNode.label,
                branch: backendNode.branch,
                branch_color: backendNode.branch_color,
                is_focus: backendNode.is_focus,
                is_branch_root: backendNode.is_branch_root,
                is_focus_branch_root: backendNode.is_branch_root && backendNode.branch === data.focus_branch,
                definition: backendNode.definition,
                depth: backendNode.depth,
              },
            };
          },
        );

        // Convert backend edges to React Flow edges
        const layoutedEdges: Edge<HierarchyEdgeData>[] = data.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'hierarchy',
          markerEnd: e.edge_type === 'subClassOf' ? { type: 'arrowclosed' as const, color: '#3b82f6' } : undefined,
          data: {
            edge_type: e.edge_type,
            label: e.label,
          },
        }));

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } finally {
        setIsLayouting(false);
      }
    },
    [],
  );

  return { nodes, edges, isLayouting, runLayout };
}
