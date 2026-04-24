'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartColors } from '@/lib/chartColors';

interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

interface DonutProps {
  data: DonutDatum[];
  height?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export default function Donut({ data, height = 220, centerLabel, centerValue }: DonutProps) {
  const c = useChartColors();
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered.length ? filtered : [{ name: 'No data', value: 1 }]}
            innerRadius="62%"
            outerRadius="92%"
            dataKey="value"
            stroke={c.surface}
            strokeWidth={2}
            paddingAngle={filtered.length > 1 ? 2 : 0}
            isAnimationActive={false}
          >
            {(filtered.length ? filtered : [{ name: 'No data', value: 1 }]).map((d, i) => (
              <Cell
                key={i}
                fill={
                  filtered.length === 0
                    ? c.border
                    : (d as DonutDatum).color || c.palette[i]
                }
              />
            ))}
          </Pie>
          {filtered.length > 0 && (
            <Tooltip
              contentStyle={{
                background: c.surface2,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                fontSize: 12,
                color: c.fg,
              }}
              formatter={(v: number, name: string) => [
                `${v.toLocaleString()} (${total ? Math.round((v / total) * 100) : 0}%)`,
                name,
              ]}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-[10px] uppercase tracking-wider text-subtle">{centerLabel}</p>
        <p className="text-2xl font-bold text-fg leading-none mt-0.5">{centerValue ?? total.toLocaleString()}</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs text-muted">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: d.color || c.palette[i] }}
            />
            <span className="capitalize">{d.name}</span>
            <span className="ml-auto text-fg font-medium">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
