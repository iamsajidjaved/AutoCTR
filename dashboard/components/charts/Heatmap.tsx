'use client';

import clsx from 'clsx';

interface HeatmapCell {
  dow: number;     // 0 = Sunday … 6 = Saturday
  hour: number;    // 0–23
  count: number;
}

interface HeatmapProps {
  cells: HeatmapCell[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function Heatmap({ cells }: HeatmapProps) {
  // Build lookup
  const lookup = new Map<string, number>();
  let max = 0;
  for (const cell of cells) {
    lookup.set(`${cell.dow}-${cell.hour}`, cell.count);
    if (cell.count > max) max = cell.count;
  }

  function intensity(v: number): number {
    if (max === 0 || v === 0) return 0;
    // Smoothed sqrt scale so small values stay visible
    return Math.min(1, Math.sqrt(v / max));
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {HOURS.map((h) => (
              <th key={h} className="text-[9px] font-medium text-subtle text-center w-[18px]">
                {h % 3 === 0 ? h : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day}>
              <td className="text-[10px] text-muted pr-2 text-right font-medium">{day}</td>
              {HOURS.map((h) => {
                const v = lookup.get(`${di}-${h}`) ?? 0;
                const a = intensity(v);
                return (
                  <td
                    key={h}
                    title={`${day} ${h.toString().padStart(2, '0')}:00 — ${v} visits`}
                    className={clsx(
                      'rounded-[3px] w-[18px] h-[18px] transition-colors',
                      v === 0 && 'bg-surface-2 border border-border/40'
                    )}
                    style={
                      v > 0
                        ? {
                            background: `rgb(var(--brand) / ${0.15 + a * 0.85})`,
                          }
                        : undefined
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-subtle justify-end">
        <span>Less</span>
        {[0.15, 0.4, 0.65, 0.85, 1].map((a) => (
          <span
            key={a}
            className="w-3 h-3 rounded-[3px]"
            style={{ background: `rgb(var(--brand) / ${a})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
