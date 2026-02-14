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
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color + '20',
        color: score >= 60 ? color : '#6B7280',
        border: `1px solid ${color}40`,
      }}
      title={label}
    >
      {rounded}
    </span>
  );
}
