'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Eye, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import api from '@/lib/api';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

interface Props {
  campaigns: Campaign[];
  onRefresh: () => void;
  emptyMessage?: string;
}

export default function CampaignTable({ campaigns, onRefresh, emptyMessage }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function doAction(id: string, action: 'pause' | 'restart' | 'activate') {
    setLoadingId(id);
    try {
      await api.post(`/api/campaigns/${id}/${action}`);
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      alert(msg || `Action "${action}" failed`);
    } finally {
      setLoadingId(null);
    }
  }

  async function doDelete(id: string) {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    setLoadingId(id);
    try {
      await api.delete(`/api/campaigns/${id}`);
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      alert(msg || 'Delete failed');
    } finally {
      setLoadingId(null);
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 text-muted">
        <p className="text-base">{emptyMessage || 'No campaigns yet.'}</p>
        <p className="text-sm mt-1 text-subtle">
          Click <span className="text-brand">+ New Campaign</span> to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 border-y border-border text-[11px] text-subtle uppercase tracking-wider">
            <th className="px-5 py-3 text-left font-semibold">Keyword</th>
            <th className="px-4 py-3 text-left font-semibold">Website</th>
            <th className="px-4 py-3 text-right font-semibold">Visits</th>
            <th className="px-4 py-3 text-right font-semibold">CTR</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Created</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campaigns.map((c) => {
            const busy = loadingId === c.id;
            return (
              <tr key={c.id} className="hover:bg-surface-hover/50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-fg max-w-[200px] truncate">
                  <button
                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                    className="hover:text-brand text-left transition-colors"
                  >
                    {c.keyword}
                  </button>
                </td>
                <td className="px-4 py-3.5 text-muted max-w-[220px] truncate">
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-brand transition-colors"
                  >
                    {c.website.replace(/^https?:\/\//, '')}
                    <ExternalLink size={11} className="opacity-60" />
                  </a>
                </td>
                <td className="px-4 py-3.5 text-right text-fg font-medium tabular-nums">
                  {c.required_visits.toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-right text-muted tabular-nums">{c.ctr}%</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3.5 text-subtle text-xs">
                  {new Date(c.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                      disabled={busy}
                      title="View"
                      className="p-1.5 rounded-md text-muted hover:bg-surface-hover hover:text-fg transition-colors disabled:opacity-40"
                    >
                      <Eye size={14} />
                    </button>

                    {c.status === 'pending' && (
                      <button
                        onClick={() => doAction(c.id, 'activate')}
                        disabled={busy}
                        title="Start"
                        className="p-1.5 rounded-md text-info hover:bg-info/10 transition-colors disabled:opacity-40"
                      >
                        <Play size={14} />
                      </button>
                    )}

                    {c.status === 'running' && (
                      <button
                        onClick={() => doAction(c.id, 'pause')}
                        disabled={busy}
                        title="Pause"
                        className="p-1.5 rounded-md text-warning hover:bg-warning/10 transition-colors disabled:opacity-40"
                      >
                        <Pause size={14} />
                      </button>
                    )}

                    {(c.status === 'paused' || c.status === 'completed') && (
                      <button
                        onClick={() => doAction(c.id, 'restart')}
                        disabled={busy}
                        title="Restart"
                        className="p-1.5 rounded-md text-success hover:bg-success/10 transition-colors disabled:opacity-40"
                      >
                        <RotateCw size={14} />
                      </button>
                    )}

                    {c.status !== 'running' && (
                      <button
                        onClick={() => doDelete(c.id)}
                        disabled={busy}
                        title="Delete"
                        className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
