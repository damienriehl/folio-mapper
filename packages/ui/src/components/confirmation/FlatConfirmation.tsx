import type { ParseItem } from '@folio-mapper/core';

interface FlatConfirmationProps {
  items: ParseItem[];
  totalItems: number;
}

export function FlatConfirmation({ items, totalItems }: FlatConfirmationProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        {totalItems} item{totalItems !== 1 ? 's' : ''} detected
      </p>
      <ol className="space-y-1">
        {items.map((item) => (
          <li
            key={item.index}
            className="flex items-baseline gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50"
          >
            <span className="shrink-0 text-xs text-gray-400">{item.index + 1}.</span>
            <span className="text-gray-800">{item.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
