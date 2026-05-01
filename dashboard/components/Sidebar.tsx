'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Megaphone,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { logout } from '@/lib/auth';
import clsx from 'clsx';

const sections: Array<{
  heading: string;
  items: Array<{ label: string; href: string; icon: React.ComponentType<{ size?: number }> }>;
}> = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Campaigns', href: '/dashboard/campaigns', icon: Megaphone },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        'sticky top-0 h-screen bg-surface border-r border-border flex flex-col transition-[width] duration-200 shrink-0 relative',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      {/* Collapse toggle — pinned to right edge, AdminLTE/Metronic style */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-5 -right-3 z-20 w-6 h-6 rounded-full bg-surface border border-border text-muted hover:text-brand hover:border-brand flex items-center justify-center shadow-sm transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      {/* Brand */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5 h-16">
        <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <Activity size={18} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-base font-bold text-fg leading-none tracking-tight">
              Auto<span className="text-brand">CTR</span>
            </p>
            <p className="text-[10px] text-muted mt-1 whitespace-nowrap">CTR Simulation Suite</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.heading}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                {section.heading}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand/10 text-brand'
                          : 'text-muted hover:bg-surface-hover hover:text-fg'
                      )}
                    >
                      <Icon size={18} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-surface-hover hover:text-danger transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
