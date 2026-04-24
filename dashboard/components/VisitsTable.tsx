'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

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

const STATUS_STYLES: Record<Visit['status'], string> = {
  pending: 'bg-gray-800 text-gray-300 border-gray-700',
  running: 'bg-blue-950 text-blue-300 border-blue-800',
  completed: 'bg-green-950 text-green-300 border-green-800',
  failed: 'bg-red-950 text-red-300 border-red-800',
};

const TYPE_STYLES: Record<Visit['type'], string> = {
  click: 'bg-purple-950 text-purple-300 border-purple-800',
  impression: 'bg-gray-800 text-gray-400 border-gray-700',
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

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, deviceFilter, sort, order]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-base font-semibold text-white">Visits</h2>
        <span className="text-xs text-gray-500">
          {total.toLocaleString()} total{total > 0 && ` · showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="">All types</option>
          <option value="click">Click</option>
          <option value="impression">Impression</option>
        </select>
        <select
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-2 py-1.5"
        >
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
          className="bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="scheduled_at:asc">Scheduled ↑</option>
          <option value="scheduled_at:desc">Scheduled ↓</option>
          <option value="started_at:desc">Started ↓</option>
          <option value="completed_at:desc">Completed ↓</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}

      {loading && visits.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Loading visits…</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No visits match the current filters.</p>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-xs text-left">
            <thead className="text-gray-500 uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="py-2 pr-3 font-medium">Scheduled</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Device</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Started</th>
                <th className="py-2 pr-3 font-medium">Completed</th>
                <th className="py-2 pr-3 font-medium">Dwell</th>
                <th className="py-2 pr-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const isOpen = expanded === v.id;
                const canExpand = !!v.error_message;
                return (
                  <Fragment key={v.id}>
                    <tr
                      className={`border-b border-gray-800/60 hover:bg-gray-800/40 ${canExpand ? 'cursor-pointer' : ''}`}
                      onClick={() => canExpand && setExpanded(isOpen ? null : v.id)}
                    >
                      <td className="py-2 pr-3 text-gray-300 whitespace-nowrap font-mono">{fmtTime(v.scheduled_at)}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_STYLES[v.type]}`}>
                          {v.type}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-300 capitalize">{v.device}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize ${STATUS_STYLES[v.status]}`}>
                          {v.status}
                        </span>
                        {canExpand && (
                          <span className="ml-1 text-gray-600">{isOpen ? '▾' : '▸'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-400 whitespace-nowrap font-mono">{fmtTime(v.started_at)}</td>
                      <td className="py-2 pr-3 text-gray-400 whitespace-nowrap font-mono">{fmtTime(v.completed_at)}</td>
                      <td className="py-2 pr-3 text-gray-300">{v.actual_dwell_seconds != null ? `${v.actual_dwell_seconds}s` : '—'}</td>
                      <td className="py-2 pr-3 text-gray-400 font-mono">{v.ip || '—'}</td>
                    </tr>
                    {isOpen && v.error_message && (
                      <tr key={`${v.id}-err`} className="border-b border-gray-800/60 bg-red-950/30">
                        <td colSpan={8} className="py-2 px-3 text-red-300 text-xs">
                          <span className="text-red-500 font-semibold">Error: </span>
                          <span className="font-mono break-all">{v.error_message}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span>
            Page <span className="text-white font-medium">{page + 1}</span> of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
