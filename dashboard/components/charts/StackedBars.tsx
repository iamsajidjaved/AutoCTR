'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChartColors } from '@/lib/chartColors';

interface Series {
  key: string;
  label: string;
  color?: string;
}

interface StackedBarsProps {
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: Series[];
  height?: number;
}

export default function StackedBars({ data, xKey, series, height = 280 }: StackedBarsProps) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={c.subtle} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={c.subtle} fontSize={11} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{
            background: c.surface2,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: c.fg,
          }}
          labelStyle={{ color: c.muted }}
          cursor={{ fill: c.border, opacity: 0.3 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: c.muted, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="a"
            name={s.label}
            fill={s.color || c.palette[i]}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
