'use client';

import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import Sparkline from './charts/Sparkline';

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;          // signed percentage; positive = up
  deltaLabel?: string;     // e.g. "vs last 7d"
  icon?: LucideIcon;
  accent?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  spark?: number[];
  hint?: string;
}

const ACCENT: Record<NonNullable<KpiCardProps['accent']>, { bg: string; text: string; spark: string }> = {
  brand:   { bg: 'bg-brand/10',   text: 'text-brand',   spark: 'rgb(var(--brand))' },
  success: { bg: 'bg-success/10', text: 'text-success', spark: 'rgb(var(--success))' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', spark: 'rgb(var(--warning))' },
  danger:  { bg: 'bg-danger/10',  text: 'text-danger',  spark: 'rgb(var(--danger))' },
  info:    { bg: 'bg-info/10',    text: 'text-info',    spark: 'rgb(var(--info))' },
};

export default function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  accent = 'brand',
  spark,
  hint,
}: KpiCardProps) {
  const a = ACCENT[accent];
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-xs">{label}</p>
          <p className="text-2xl font-bold text-fg mt-1.5 leading-none tracking-tight">{value}</p>
          {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
        </div>
        {Icon && (
          <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', a.bg, a.text)}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        {typeof delta === 'number' ? (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              positive ? 'text-success' : 'text-danger'
            )}
          >
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta).toFixed(1)}%
            {deltaLabel && <span className="text-subtle font-normal ml-1">{deltaLabel}</span>}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && (
          <div className="w-24 h-8">
            <Sparkline data={spark} color={a.spark} />
          </div>
        )}
      </div>
    </div>
  );
}
