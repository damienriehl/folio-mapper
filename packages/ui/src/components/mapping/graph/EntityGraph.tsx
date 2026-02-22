import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { EntityGraphResponse } from '@folio-mapper/core';
import { fetchEntityGraph } from '@folio-mapper/core';
import { ConceptNode } from './ConceptNode';
import { HierarchyEdge } from './HierarchyEdge';
import { useELKLayout, type LayoutDirection } from './useELKLayout';

interface EntityGraphProps {
  iriHash: string;
  label: string;
  onNavigateToConcept?: (iriHash: string) => void;
}

const nodeTypes = { concept: ConceptNode };
const edgeTypes = { hierarchy: HierarchyEdge };

export function EntityGraph({ iriHash, label, onNavigateToConcept }: EntityGraphProps) {
  const [graphData, setGraphData] = useState<EntityGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDescendants, setShowDescendants] = useState(false);
  const [direction, setDirection] = useState<LayoutDirection>('TB');

  const { nodes: layoutNodes, edges: layoutEdges, isLayouting, runLayout } = useELKLayout();
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Fetch graph data (ancestors only by default, add descendants on toggle)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchEntityGraph(iriHash, {
      ancestorsDepth: 5,
      descendantsDepth: showDescendants ? 2 : 0,
    })
      .then((data) => {
        if (!cancelled) {
          setGraphData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [iriHash, showDescendants]);

  // Run layout when data or direction changes
  useEffect(() => {
    if (!graphData) return;
    runLayout(graphData, direction).catch(() => {
      setError('Layout computation failed');
    });
  }, [graphData, direction, runLayout]);

  // Sync layout results to React Flow state
  useEffect(() => {
    if (layoutNodes.length > 0) {
      setNodes(layoutNodes);
      setEdges(layoutEdges);
    }
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  // Progressive expansion: click a node to fetch and merge its neighborhood
  const expandedNodes = useMemo(() => new Set<string>([iriHash]), [iriHash]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (expandedNodes.has(node.id)) {
        // Already expanded: navigate to detail
        onNavigateToConcept?.(node.id);
        return;
      }

      // Expand this node's neighborhood
      expandedNodes.add(node.id);
      fetchEntityGraph(node.id, { ancestorsDepth: 1, descendantsDepth: 1 })
        .then((newData) => {
          if (!graphData) return;

          // Merge new nodes/edges into existing graph
          const existingNodeIds = new Set(graphData.nodes.map((n) => n.id));
          const existingEdgeIds = new Set(graphData.edges.map((e) => e.id));

          const mergedNodes = [
            ...graphData.nodes,
            ...newData.nodes.filter((n) => !existingNodeIds.has(n.id)),
          ];
          const mergedEdges = [
            ...graphData.edges,
            ...newData.edges.filter((e) => !existingEdgeIds.has(e.id)),
          ];

          const merged: EntityGraphResponse = {
            ...graphData,
            nodes: mergedNodes,
            edges: mergedEdges,
            total_concept_count: mergedNodes.length,
          };
          setGraphData(merged);
        })
        .catch(() => {
          // Silently fail expansion
        });
    },
    [graphData, expandedNodes, onNavigateToConcept],
  );

  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onNavigateToConcept?.(node.id);
    },
    [onNavigateToConcept],
  );

  const toggleDirection = useCallback(() => {
    setDirection((d) => (d === 'TB' ? 'LR' : 'TB'));
  }, []);

  const toggleDescendants = useCallback(() => {
    setShowDescendants((d) => !d);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <span className="text-sm text-gray-500">Loading entity graph...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">Failed to load graph</p>
          <p className="mt-1 text-xs text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">No graph data available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <button
          type="button"
          onClick={toggleDirection}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
          title={`Switch to ${direction === 'TB' ? 'left-to-right' : 'top-to-bottom'} layout`}
        >
          {direction === 'TB' ? 'Layout: Top-Down' : 'Layout: Left-Right'}
        </button>
        <button
          type="button"
          onClick={toggleDescendants}
          className={`rounded border px-2 py-0.5 text-xs ${
            showDescendants
              ? 'border-blue-300 bg-blue-50 font-medium text-blue-700 hover:bg-blue-100'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100'
          }`}
          title={showDescendants ? 'Hide descendant concepts' : 'Show descendant concepts'}
        >
          {showDescendants ? 'Descendants: On' : 'Show Descendants'}
        </button>
        {isLayouting && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
            Computing layout...
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {graphData.nodes.length} nodes, {graphData.edges.length} edges
        </span>
        {graphData.truncated && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Graph truncated ({graphData.total_concept_count} concepts discovered)
          </span>
        )}
      </div>

      {/* Graph canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView
          fitViewOptions={{ padding: 0.2, duration: 400 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'hierarchy' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              if (node.data?.is_focus) return '#3b82f6';
              if (node.data?.is_branch_root && node.data?.is_focus_branch_root) return '#ef4444';
              if (node.data?.is_branch_root) return '#6b7280';
              return '#d1d5db';
            }}
            maskColor="rgba(0,0,0,0.1)"
            className="!bg-gray-50 !border-gray-200"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <svg width="20" height="10" className="shrink-0">
            <line x1="0" y1="5" x2="16" y2="5" stroke="#3b82f6" strokeWidth="2" />
            <polygon points="14,2 20,5 14,8" fill="#3b82f6" />
          </svg>
          <span>subClassOf</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="10" className="shrink-0">
            <line x1="0" y1="5" x2="20" y2="5" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="4,2" />
          </svg>
          <span>rdfs:seeAlso</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-blue-400 bg-blue-50" />
          <span>Focus</span>
        </div>
        <span className="ml-auto text-gray-400">Click to expand, double-click to navigate</span>
      </div>
    </div>
  );
}
