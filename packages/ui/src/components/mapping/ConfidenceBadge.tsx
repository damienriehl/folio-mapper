import { getConfidenceColor, getConfidenceLabel } from '@folio-mapper/core';

interface ConfidenceBadgeProps {
  score: number;
  isSelected?: boolean;
}

export function ConfidenceBadge({ score, isSelected }: ConfidenceBadgeProps) {
  const color = getConfidenceColor(score);
  const label = getConfidenceLabel(score);
  const rounded = Math.round(score);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{
        backgroundColor: isSelected ? '#ffffff' : color + '28',
        color: isSelected ? color : color,
        border: `1.5px solid ${isSelected ? '#ffffff' : color + '70'}`,
      }}
      title={label}
    >
      {rounded}
    </span>
  );
}
