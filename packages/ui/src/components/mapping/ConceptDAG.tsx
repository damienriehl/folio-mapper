import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import type { HierarchyPathEntry } from '@folio-mapper/core';

interface ConceptDAGProps {
  concept: { label: string; iri_hash: string; branch_color: string };
  parents: HierarchyPathEntry[];
  children: HierarchyPathEntry[];
  childrenCutoff?: number;
  hideDescendants?: boolean;
  onSelectForDetail?: (iriHash: string) => void;
}

export function ConceptDAG({
  concept,
  parents,
  children,
  childrenCutoff = 6,
  hideDescendants = false,
  onSelectForDetail,
}: ConceptDAGProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDescendants, setShowDescendants] = useState(!hideDescendants);
  const [lineKey, setLineKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const visibleChildren = showDescendants
    ? expanded
      ? children
      : children.slice(0, childrenCutoff)
    : [];
  const remaining = children.length - childrenCutoff;

  const handleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
    setLineKey((k) => k + 1);
  }, []);

  const handleToggleDescendants = useCallback(() => {
    setShowDescendants((prev) => !prev);
    setLineKey((k) => k + 1);
  }, []);

  // Draw SVG bezier lines between nodes
  useLayoutEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const containerRect = container.getBoundingClientRect();
    const paths: string[] = [];
    const conceptEl = container.querySelector('[data-dag-id="concept"]');
    if (!conceptEl) return;

    const conceptRect = conceptEl.getBoundingClientRect();
    const conceptCX = conceptRect.left + conceptRect.width / 2 - containerRect.left;
    const conceptTop = conceptRect.top - containerRect.top;
    const conceptBottom = conceptRect.bottom - containerRect.top;

    // Parent lines: parent bottom-center → concept top-center
    const parentEls = container.querySelectorAll('[data-dag-role="parent"]');
    parentEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const parentCX = rect.left + rect.width / 2 - containerRect.left;
      const parentBottom = rect.bottom - containerRect.top;
      const midY = (parentBottom + conceptTop) / 2;
      paths.push(`M ${parentCX} ${parentBottom} Q ${parentCX} ${midY} ${conceptCX} ${conceptTop}`);
    });

    // Child lines: concept bottom-center → child top-center
    const childEls = container.querySelectorAll('[data-dag-role="child"]');
    childEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const childCX = rect.left + rect.width / 2 - containerRect.left;
      const childTop = rect.top - containerRect.top;
      const midY = (conceptBottom + childTop) / 2;
      paths.push(`M ${conceptCX} ${conceptBottom} Q ${conceptCX} ${midY} ${childCX} ${childTop}`);
    });

    // Set SVG size to match container
    svg.setAttribute('width', String(containerRect.width));
    svg.setAttribute('height', String(containerRect.height));

    // Clear and draw
    svg.innerHTML = '';
    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#3b82f6');
      path.setAttribute('opacity', '0.4');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    }
  }, [parents, visibleChildren, concept.branch_color, lineKey]);

  if (parents.length === 0 && children.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 0 }}
      />

      {/* Parent row */}
      {parents.length > 0 && (
        <div className="relative z-10 flex flex-wrap justify-center gap-2">
          {parents.map((p) => (
            <span
              key={p.iri_hash}
              data-dag-id={p.iri_hash}
              data-dag-role="parent"
              title={p.label}
              onClick={() => onSelectForDetail?.(p.iri_hash)}
              className={`max-w-[130px] truncate rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 ${onSelectForDetail ? 'cursor-pointer' : ''}`}
            >
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* Spacer */}
      {parents.length > 0 && <div className="py-4" />}

      {/* Concept center */}
      <div className="relative z-10 flex justify-center">
        <span
          data-dag-id="concept"
          className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800"
        >
          {concept.label}
        </span>
      </div>

      {/* Descendants toggle + children */}
      {children.length > 0 && (
        <>
          {showDescendants ? (
            <>
              <div className="py-4" />
              <div className="relative z-10">
                <div className="flex flex-wrap justify-center gap-2">
                  {visibleChildren.map((c) => (
                    <span
                      key={c.iri_hash}
                      data-dag-id={c.iri_hash}
                      data-dag-role="child"
                      title={c.label}
                      onClick={() => onSelectForDetail?.(c.iri_hash)}
                      className={`max-w-[130px] truncate rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 ${onSelectForDetail ? 'cursor-pointer' : ''}`}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex justify-center gap-2">
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={handleExpand}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {expanded ? 'Show less' : `Show ${remaining} more`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleToggleDescendants}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Hide descendants
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="relative z-10 mt-2 flex justify-center">
              <button
                type="button"
                onClick={handleToggleDescendants}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Show descendants ({children.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
