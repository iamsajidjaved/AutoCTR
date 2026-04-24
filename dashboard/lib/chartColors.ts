'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Resolves chart color tokens from CSS variables so Recharts re-renders
 * pick up the active theme. Returns hex-equivalent rgb() strings.
 */
export function useChartColors() {
  const { theme } = useTheme();
  const [colors, setColors] = useState(() => readColors());

  useEffect(() => {
    setColors(readColors());
  }, [theme]);

  return colors;
}

function readColors() {
  if (typeof window === 'undefined') {
    return DEFAULTS;
  }
  const css = getComputedStyle(document.documentElement);
  function v(name: string, fallback: string): string {
    const raw = css.getPropertyValue(name).trim();
    if (!raw) return fallback;
    const parts = raw.split(/\s+/).map((s) => s.replace(/,$/, ''));
    if (parts.length >= 3) return `rgb(${parts[0]} ${parts[1]} ${parts[2]})`;
    return fallback;
  }
  return {
    fg: v('--fg', '#f1f5f9'),
    muted: v('--muted', '#94a3b8'),
    subtle: v('--subtle', '#64748b'),
    border: v('--border', '#262c3c'),
    surface: v('--surface', '#11141e'),
    surface2: v('--surface-2', '#181c29'),
    brand: v('--brand', '#3b82f6'),
    success: v('--success', '#22c55e'),
    warning: v('--warning', '#eab308'),
    danger: v('--danger', '#ef4444'),
    info: v('--info', '#60a5fa'),
    palette: [
      v('--brand', '#3b82f6'),
      v('--success', '#22c55e'),
      v('--warning', '#eab308'),
      v('--danger', '#ef4444'),
      v('--info', '#60a5fa'),
      '#a855f7',
      '#ec4899',
      '#14b8a6',
    ],
  };
}

const DEFAULTS = {
  fg: '#f1f5f9',
  muted: '#94a3b8',
  subtle: '#64748b',
  border: '#262c3c',
  surface: '#11141e',
  surface2: '#181c29',
  brand: '#3b82f6',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
  info: '#60a5fa',
  palette: ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#60a5fa', '#a855f7', '#ec4899', '#14b8a6'],
};
