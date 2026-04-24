'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import StatusBadge from './StatusBadge';
import clsx from 'clsx';

interface Visit {
  id: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  type: 'impression' | 'click';
  device: 'mobile' | 'desktop';
  status: 'pending' | 'running' | 'completed' | 'failed';
  ip: string | null;
  actual_dwell_seconds: number | null;
  error_message: string | null;
}

interface Props {
  campaignId: string;
  autoRefresh: boolean;
}

const PAGE_SIZE = 25;

const TYPE_STYLES: Record<Visit['type'], string> = {
  click: 'bg-brand/10 text-brand border-brand/30',
  impression: 'bg-surface-2 text-muted border-border',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function VisitsTable({ campaignId, autoRefresh }: Props) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [sort, setSort] = useState<'scheduled_at' | 'started_at' | 'completed_at'>('scheduled_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      params.set('sort', sort);
      params.set('order', order);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (deviceFilter) params.set('device', deviceFilter);
      const res = await api.get(`/api/campaigns/${campaignId}/visits?${params.toString()}`);
      setVisits(res.data.visits);
      setTotal(res.data.total);
      setError('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || 'Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [campaignId, page, sort, order, statusFilter, typeFilter, deviceFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, deviceFilter, sort, order]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectCls =
    'bg-surface-2 border border-border text-fg rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/40';

  return (
    <div className="card">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-fg">Visits</h3>
          <p className="text-xs text-muted mt-0.5">
            {total.toLocaleString()} total{total > 0 && ` · showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="">All types</option>
            <option value="click">Click</option>
            <option value="impression">Impression</option>
          </select>
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} className={selectCls}>
            <option value="">All devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
          <select
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [s, o] = e.target.value.split(':');
              setSort(s as typeof sort);
              setOrder(o as typeof order);
            }}
            className={selectCls}
          >
            <option value="scheduled_at:asc">Scheduled ↑</option>
            <option value="scheduled_at:desc">Scheduled ↓</option>
            <option value="started_at:desc">Started ↓</option>
            <option value="completed_at:desc">Completed ↓</option>
          </select>
        </div>
      </header>

      {error && (
        <div className="bg-danger/10 border-b border-danger/30 text-danger px-5 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        {loading && visits.length === 0 ? (
          <p className="text-sm text-muted py-10 text-center">Loading visits…</p>
        ) : visits.length === 0 ? (
          <p className="text-sm text-muted py-10 text-center">No visits match the current filters.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-[10px] uppercase tracking-wider text-subtle">
                <th className="py-2.5 pl-5 pr-3 text-left font-semibold">Scheduled</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Type</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Device</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Status</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Started</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Completed</th>
                <th className="py-2.5 pr-3 text-left font-semibold">Dwell</th>
                <th className="py-2.5 pr-5 text-left font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visits.map((v) => {
                const isOpen = expanded === v.id;
                const canExpand = !!v.error_message;
                return (
                  <Fragment key={v.id}>
                    <tr
                      className={clsx(
                        'hover:bg-surface-hover/40 transition-colors',
                        canExpand && 'cursor-pointer'
                      )}
                      onClick={() => canExpand && setExpanded(isOpen ? null : v.id)}
                    >
                      <td className="py-2 pl-5 pr-3 text-muted whitespace-nowrap font-mono">{fmtTime(v.scheduled_at)}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_STYLES[v.type]}`}>
                          {v.type}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-fg capitalize">{v.device}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge status={v.status} />
                          {canExpand && (isOpen ? <ChevronDown size={12} className="text-subtle" /> : <ChevronRight size={12} className="text-subtle" />)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-muted whitespace-nowrap font-mono">{fmtTime(v.started_at)}</td>
                      <td className="py-2 pr-3 text-muted whitespace-nowrap font-mono">{fmtTime(v.completed_at)}</td>
                      <td className="py-2 pr-3 text-fg tabular-nums">{v.actual_dwell_seconds != null ? `${v.actual_dwell_seconds}s` : '—'}</td>
                      <td className="py-2 pr-5 text-muted font-mono">{v.ip || '—'}</td>
                    </tr>
                    {isOpen && v.error_message && (
                      <tr key={`${v.id}-err`} className="bg-danger/5">
                        <td colSpan={8} className="py-2 px-5 text-danger text-xs">
                          <span className="font-semibold">Error: </span>
                          <span className="font-mono break-all">{v.error_message}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            ← Prev
          </button>
          <span>
            Page <span className="text-fg font-medium">{page + 1}</span> of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
