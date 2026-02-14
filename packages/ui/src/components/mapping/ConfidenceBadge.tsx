import { getConfidenceColor, getConfidenceLabel } from '@folio-mapper/core';

interface ConfidenceBadgeProps {
  score: number;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  const color = getConfidenceColor(score);
  const label = getConfidenceLabel(score);
  const rounded = Math.round(score);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        backgroundColor: color + '28',
        color: color,
        border: `1.5px solid ${color}70`,
      }}
      title={label}
    >
      {rounded}
    </span>
  );
}
