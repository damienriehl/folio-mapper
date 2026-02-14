interface BranchFilterProps {
  branches: Array<{ name: string; color: string }>;
  enabledBranches: Set<string>;
  onToggle: (branchName: string) => void;
}

export function BranchFilter({ branches, enabledBranches, onToggle }: BranchFilterProps) {
  if (branches.length === 0) return null;

  return (
    <div>
      <div className="space-y-0.5">
        {branches.map((branch) => (
          <label
            key={branch.name}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={enabledBranches.has(branch.name)}
              onChange={() => onToggle(branch.name)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: branch.color }}
            />
            <span className="text-gray-700">{branch.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
