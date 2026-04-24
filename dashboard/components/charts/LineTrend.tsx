'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartColors } from '@/lib/chartColors';

interface LineTrendProps {
  data: Array<Record<string, number | string>>;
  xKey: string;
  yKey: string;
  label?: string;
  color?: string;
  height?: number;
  yFormatter?: (v: number) => string;
}

export default function LineTrend({
  data, xKey, yKey, label, color, height = 240, yFormatter,
}: LineTrendProps) {
  const c = useChartColors();
  const stroke = color || c.brand;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} stroke={c.subtle} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke={c.subtle}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={yFormatter}
        />
        <Tooltip
          contentStyle={{
            background: c.surface2,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: c.fg,
          }}
          labelStyle={{ color: c.muted }}
          formatter={(v: number) => [yFormatter ? yFormatter(v) : v, label || yKey]}
          cursor={{ stroke: c.border }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={stroke}
          strokeWidth={2.5}
          dot={{ r: 3, fill: stroke }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
