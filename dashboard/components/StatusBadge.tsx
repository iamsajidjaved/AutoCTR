interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-300',
    running: 'bg-blue-900 text-blue-300 animate-pulse',
    completed: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    paused: 'bg-yellow-900 text-yellow-300',
  };
  const cls = styles[status] ?? 'bg-gray-700 text-gray-300';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {status}
    </span>
  );
}
