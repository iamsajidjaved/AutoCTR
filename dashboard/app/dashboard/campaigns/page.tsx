'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import AppShell from '@/components/AppShell';
import Card from '@/components/Card';
import CampaignTable from '@/components/CampaignTable';
import clsx from 'clsx';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

const STATUSES = ['all', 'pending', 'running', 'paused', 'completed'] as const;

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('all');
  const [error, setError] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      setRefreshing(true);
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
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter);

  return (
    <AppShell
      title="Campaigns"
      subtitle={`${campaigns.length} total · manage every CTR job`}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={fetchCampaigns} disabled={refreshing} className="btn-secondary text-xs">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/dashboard/campaigns/new" className="btn-primary text-sm">
            <Plus size={14} />
            New Campaign
          </Link>
        </div>
      }
    >
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUSES.map((s) => {
          const count = s === 'all' ? campaigns.length : campaigns.filter((c) => c.status === s).length;
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border',
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface text-muted border-border hover:bg-surface-hover hover:text-fg'
              )}
            >
              {s} <span className={clsx('ml-1', active ? 'text-white/80' : 'text-subtle')}>({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading campaigns…</p>
      ) : error ? (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : (
        <Card noPadding>
          <CampaignTable campaigns={filtered} onRefresh={fetchCampaigns} />
        </Card>
      )}
    </AppShell>
  );
}
