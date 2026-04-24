'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
}

export default function CampaignTable({ campaigns, onRefresh }: Props) {
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
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg">No campaigns yet.</p>
        <p className="text-sm mt-1">Click <span className="text-blue-400">+ New Campaign</span> to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Keyword</th>
            <th className="px-4 py-3 text-left">Website</th>
            <th className="px-4 py-3 text-center">Visits</th>
            <th className="px-4 py-3 text-center">CTR</th>
            <th className="px-4 py-3 text-center">Status</th>
            <th className="px-4 py-3 text-center">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {campaigns.map((c) => {
            const busy = loadingId === c.id;
            return (
              <tr
                key={c.id}
                className="bg-gray-950 hover:bg-gray-900 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-white max-w-[180px] truncate">
                  <button
                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                    className="hover:text-blue-400 text-left transition-colors"
                  >
                    {c.keyword}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400 max-w-[180px] truncate">
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                    {c.website.replace(/^https?:\/\//, '')}
                  </a>
                </td>
                <td className="px-4 py-3 text-center text-gray-300">{c.required_visits.toLocaleString()}</td>
                <td className="px-4 py-3 text-center text-gray-300">{c.ctr}%</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {new Date(c.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    {/* View */}
                    <button
                      onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40"
                    >
                      View
                    </button>

                    {/* Activate (pending only) */}
                    {c.status === 'pending' && (
                      <button
                        onClick={() => doAction(c.id, 'activate')}
                        disabled={busy}
                        className="px-2.5 py-1 rounded text-xs bg-blue-700 text-white hover:bg-blue-600 transition-colors disabled:opacity-40"
                      >
                        {busy ? '...' : 'Start'}
                      </button>
                    )}

                    {/* Pause (running only) */}
                    {c.status === 'running' && (
                      <button
                        onClick={() => doAction(c.id, 'pause')}
                        disabled={busy}
                        className="px-2.5 py-1 rounded text-xs bg-yellow-700 text-white hover:bg-yellow-600 transition-colors disabled:opacity-40"
                      >
                        {busy ? '...' : 'Pause'}
                      </button>
                    )}

                    {/* Restart (paused or completed) */}
                    {(c.status === 'paused' || c.status === 'completed') && (
                      <button
                        onClick={() => doAction(c.id, 'restart')}
                        disabled={busy}
                        className="px-2.5 py-1 rounded text-xs bg-green-700 text-white hover:bg-green-600 transition-colors disabled:opacity-40"
                      >
                        {busy ? '...' : 'Restart'}
                      </button>
                    )}

                    {/* Delete (not running) */}
                    {c.status !== 'running' && (
                      <button
                        onClick={() => doDelete(c.id)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded text-xs bg-red-900 text-red-300 hover:bg-red-800 transition-colors disabled:opacity-40"
                      >
                        {busy ? '...' : 'Delete'}
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
