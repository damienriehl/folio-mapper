interface ThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs font-medium text-gray-500" htmlFor="threshold-slider">
        Threshold
      </label>
      <input
        id="threshold-slider"
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
      />
      <span className="w-8 text-right text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}
