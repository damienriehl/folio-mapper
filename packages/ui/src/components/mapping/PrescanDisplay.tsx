import { useState } from 'react';
import type { PreScanSegment } from '@folio-mapper/core';
import { BRANCH_COLORS } from '@folio-mapper/core';

interface PrescanDisplayProps {
  itemText: string;
  segments: PreScanSegment[] | null;
}

// Build name → color lookup from BRANCH_COLORS
const BRANCH_COLOR_BY_NAME: Record<string, string> = {};
for (const val of Object.values(BRANCH_COLORS)) {
  BRANCH_COLOR_BY_NAME[val.name] = val.color;
}

export function PrescanDisplay({ itemText, segments }: PrescanDisplayProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Fallback: plain text when no prescan data
  if (!segments || segments.length === 0) {
    return <p className="mt-1 text-base font-semibold text-gray-900">{itemText}</p>;
  }

  return (
    <div className="mt-1">
      {/* Segmented text with branch badges */}
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1.5">
        {segments.map((seg, idx) => {
          const hasBranches = seg.branches.length > 0;
          const primaryColor = hasBranches
            ? BRANCH_COLOR_BY_NAME[seg.branches[0]] || '#6B7280'
            : undefined;

          return (
            <span
              key={idx}
              className="relative inline-flex flex-col items-start"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Segment text */}
              <span
                className={`rounded px-1 text-base font-semibold ${
                  hasBranches ? 'text-gray-900' : 'text-gray-500'
                }`}
                style={
                  hasBranches
                    ? { backgroundColor: primaryColor + '18' }
                    : undefined
                }
              >
                {seg.text}
              </span>

              {/* Branch badges beneath segment */}
              {hasBranches && (
                <span className="mt-0.5 flex flex-wrap gap-0.5 px-1">
                  {seg.branches.map((branch) => {
                    const color = BRANCH_COLOR_BY_NAME[branch] || '#6B7280';
                    return (
                      <span
                        key={branch}
                        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-medium leading-tight"
                        style={{
                          backgroundColor: color + '20',
                          color: color,
                        }}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {branch}
                      </span>
                    );
                  })}
                </span>
              )}

              {/* Tooltip with reasoning */}
              {hoveredIdx === idx && seg.reasoning && (
                <span className="absolute top-full left-0 z-10 mt-1 w-56 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
                  {seg.reasoning}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
