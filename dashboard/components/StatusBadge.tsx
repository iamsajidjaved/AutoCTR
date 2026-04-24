import clsx from 'clsx';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STYLES: Record<string, string> = {
  pending:   'bg-surface-2 text-muted border border-border',
  running:   'bg-info/10 text-info border border-info/30',
  completed: 'bg-success/10 text-success border border-success/30',
  failed:    'bg-danger/10 text-danger border border-danger/30',
  paused:    'bg-warning/10 text-warning border border-warning/30',
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cls = STYLES[status] ?? STYLES.pending;
  const isRunning = status === 'running';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium capitalize',
        cls,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          isRunning && 'animate-pulse',
          status === 'pending'   && 'bg-muted',
          status === 'running'   && 'bg-info',
          status === 'completed' && 'bg-success',
          status === 'failed'    && 'bg-danger',
          status === 'paused'    && 'bg-warning'
        )}
      />
      {status}
    </span>
  );
}
