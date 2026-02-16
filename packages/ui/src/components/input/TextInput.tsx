interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  itemCount: number;
  onSubmit: () => void;
  disabled?: boolean;
}

export function TextInput({ value, onChange, itemCount, onSubmit, disabled }: TextInputProps) {
  return (
    <div className="w-full">
      <label htmlFor="text-input" className="mb-2 block text-sm font-medium text-gray-700">
        Paste your items (one per line)
      </label>
      <div className="relative">
        <textarea
          id="text-input"
          className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          rows={8}
          placeholder="Enter items here, one per line..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {itemCount > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            {itemCount} item{itemCount !== 1 ? 's' : ''} detected
          </span>
        )}
      </div>
      <button
        type="button"
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={disabled || itemCount === 0}
        onClick={onSubmit}
      >
        Parse Text
      </button>
    </div>
  );
}
