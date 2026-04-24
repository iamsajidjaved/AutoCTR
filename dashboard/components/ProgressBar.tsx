interface ProgressBarProps {
  completed: number;
  total: number;
}

export default function ProgressBar({ completed, total }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{completed} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
