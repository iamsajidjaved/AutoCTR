'use client';

import {
  AreaChart,
  Area,
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

interface AreaTrendProps {
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: Series[];
  height?: number;
}

export default function AreaTrend({ data, xKey, series, height = 280 }: AreaTrendProps) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color || c.palette[i]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color || c.palette[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
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
          cursor={{ stroke: c.border }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: c.muted, paddingTop: 8 }}
        />
        {series.map((s, i) => {
          const color = s.color || c.palette[i];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
