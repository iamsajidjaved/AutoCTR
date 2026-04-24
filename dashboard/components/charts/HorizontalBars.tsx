'use client';

import { useChartColors } from '@/lib/chartColors';

interface HBarRow {
  label: string;
  value: number;
  sub?: string;
}

interface HorizontalBarsProps {
  rows: HBarRow[];
  color?: string;
  formatValue?: (v: number) => string;
  emptyMessage?: string;
}

export default function HorizontalBars({
  rows,
  color,
  formatValue = (v) => v.toLocaleString(),
  emptyMessage = 'No data yet',
}: HorizontalBarsProps) {
  const c = useChartColors();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const fill = color || c.brand;

  if (!rows.length) {
    return <p className="text-sm text-muted py-6 text-center">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <li key={r.label}>
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <span className="text-fg font-medium truncate pr-2">{r.label}</span>
              <span className="text-muted shrink-0">{formatValue(r.value)}</span>
            </div>
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: fill }}
              />
            </div>
            {r.sub && <p className="text-[10px] text-subtle mt-1 truncate">{r.sub}</p>}
          </li>
        );
      })}
    </ul>
  );
}
