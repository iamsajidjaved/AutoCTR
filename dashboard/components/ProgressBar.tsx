interface ProgressBarProps {
  completed: number;
  total: number;
  showLabel?: boolean;
}

export default function ProgressBar({ completed, total, showLabel = true }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>{completed.toLocaleString()} / {total.toLocaleString()} visits</span>
          <span className="font-semibold text-fg">{pct}%</span>
        </div>
      )}
      <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
        <div
          className="bg-brand h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
