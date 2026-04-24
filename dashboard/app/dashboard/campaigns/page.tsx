'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import api from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import CampaignTable from '@/components/CampaignTable';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const [error, setError] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/api/campaigns');
      setCampaigns(res.data);
      setError('');
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (!status || status !== 401) {
        setError('Failed to load campaigns. Is the API server running?');
      }
    }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    fetchCampaigns().finally(() => setLoading(false));
  }, [fetchCampaigns, router]);

  const statuses = ['all', 'pending', 'running', 'paused', 'completed'];
  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 overflow-auto">
        <div className="flex justify-between items-center mb-7">
          <div>
            <h1 className="text-2xl font-bold text-white">Campaigns</h1>
            <p className="text-sm text-gray-500 mt-0.5">{campaigns.length} total campaigns</p>
          </div>
          <Link
            href="/dashboard/campaigns/new"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Campaign
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {s} {s === 'all' ? `(${campaigns.length})` : `(${campaigns.filter((c) => c.status === s).length})`}
            </button>
          ))}
          <button
            onClick={fetchCampaigns}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading campaigns...</p>
        ) : error ? (
          <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        ) : (
          <CampaignTable campaigns={filtered} onRefresh={fetchCampaigns} />
        )}
      </main>
    </div>
  );
}
