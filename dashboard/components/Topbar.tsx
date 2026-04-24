'use client';

import { Bell, Search } from 'lucide-react';
import { ReactNode } from 'react';
import ThemeToggle from './ThemeToggle';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 h-16 bg-bg/80 backdrop-blur border-b border-border flex items-center px-6 gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-fg leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 w-72 text-muted">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search campaigns…"
          className="bg-transparent text-sm outline-none flex-1 text-fg placeholder:text-subtle"
        />
        <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-subtle border border-border">⌘K</kbd>
      </div>

      <button
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-hover text-muted hover:text-fg transition-colors"
      >
        <Bell size={16} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
      </button>

      <ThemeToggle />

      {actions}
    </header>
  );
}
