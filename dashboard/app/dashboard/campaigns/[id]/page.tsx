'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import api from '@/lib/api';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/StatusBadge';
import Sidebar from '@/components/Sidebar';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  mobile_desktop_ratio: number;
  status: string;
  min_dwell_seconds: number;
  max_dwell_seconds: number;
  campaign_duration_days: number;
  initial_daily_visits: number | null;
  daily_increase_pct: string | null;
  created_at: string;
}

interface Progress {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  percentComplete: number;
  avgDwellSeconds: number | null;
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await api.get(`/api/campaigns/${id}/progress`);
      setCampaign(res.data.campaign);
      setProgress(res.data.progress);
    } catch {
      router.replace('/login');
    }
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    fetchProgress().finally(() => setLoading(false));
  }, [fetchProgress, router]);

  useEffect(() => {
    if (!campaign || campaign.status !== 'running') return;
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [campaign, fetchProgress]);

  async function doAction(action: 'pause' | 'restart' | 'activate') {
    setActionLoading(true);
    try {
      await api.post(`/api/campaigns/${id}/${action}`);
      await fetchProgress();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      alert(msg || `Action "${action}" failed`);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-8 py-7 text-gray-500">Loading...</main>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-8 py-7 text-red-400">Campaign not found.</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 overflow-auto">
        <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-5 inline-block">
          ← Back to Overview
        </Link>

        {/* Header card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-5">
          <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-white mb-1">{campaign.keyword}</h1>
              <a
                href={campaign.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:underline"
              >
                {campaign.website}
              </a>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={campaign.status} />
              {/* Action buttons */}
              {campaign.status === 'pending' && (
                <button
                  onClick={() => doAction('activate')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  Start
                </button>
              )}
              {campaign.status === 'running' && (
                <button
                  onClick={() => doAction('pause')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm bg-yellow-700 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-40 transition-colors"
                >
                  {actionLoading ? '...' : 'Pause'}
                </button>
              )}
              {(campaign.status === 'paused' || campaign.status === 'completed') && (
                <button
                  onClick={() => doAction('restart')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-40 transition-colors"
                >
                  {actionLoading ? '...' : 'Restart'}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Total Visits</p>
              <p className="text-white font-semibold">{campaign.required_visits.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">CTR</p>
              <p className="text-white font-semibold">{campaign.ctr}%</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Duration</p>
              <p className="text-white font-semibold">{campaign.campaign_duration_days} day{campaign.campaign_duration_days !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Mobile Traffic</p>
              <p className="text-white font-semibold">{campaign.mobile_desktop_ratio}%</p>
            </div>
            {campaign.initial_daily_visits != null && (
              <>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-0.5">Day 1 Visits</p>
                  <p className="text-white font-semibold">{campaign.initial_daily_visits.toLocaleString()}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-0.5">Daily Increase</p>
                  <p className="text-white font-semibold">{Number(campaign.daily_increase_pct)}%</p>
                </div>
              </>
            )}
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Min Dwell</p>
              <p className="text-white font-semibold">{campaign.min_dwell_seconds}s</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Max Dwell</p>
              <p className="text-white font-semibold">{campaign.max_dwell_seconds}s</p>
            </div>
          </div>
        </div>

        {/* Progress card */}
        {progress && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-5">Visit Progress</h2>
            <div className="mb-6">
              <ProgressBar
                completed={progress.completed + progress.failed}
                total={progress.total}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-gray-500 text-xs mb-1">Pending</p>
                <p className="text-2xl font-bold text-gray-300">{progress.pending}</p>
              </div>
              <div className="bg-blue-950 rounded-lg p-3 text-center">
                <p className="text-blue-400 text-xs mb-1">Running</p>
                <p className="text-2xl font-bold text-blue-300">{progress.running}</p>
              </div>
              <div className="bg-green-950 rounded-lg p-3 text-center">
                <p className="text-green-400 text-xs mb-1">Completed</p>
                <p className="text-2xl font-bold text-green-300">{progress.completed}</p>
              </div>
              <div className="bg-red-950 rounded-lg p-3 text-center">
                <p className="text-red-400 text-xs mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-300">{progress.failed}</p>
              </div>
            </div>
            {progress.avgDwellSeconds !== null && (
              <p className="text-sm text-gray-500 mt-4">
                Avg dwell time: <span className="text-white font-medium">{progress.avgDwellSeconds}s</span>
              </p>
            )}
            {campaign.status === 'running' && (
              <p className="text-xs text-gray-600 mt-3">Auto-refreshing every 5 seconds…</p>
            )}
            {campaign.status === 'completed' && (
              <p className="text-xs text-green-500 mt-3 font-medium">✓ Campaign completed</p>
            )}
            {campaign.status === 'paused' && (
              <p className="text-xs text-yellow-500 mt-3 font-medium">⏸ Campaign paused — click Restart to run again from scratch</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
