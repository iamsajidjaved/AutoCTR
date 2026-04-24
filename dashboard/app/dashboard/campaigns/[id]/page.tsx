'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import api from '@/lib/api';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/StatusBadge';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  min_dwell_seconds: number;
  max_dwell_seconds: number;
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
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    fetchProgress().finally(() => setLoading(false));
  }, [fetchProgress, router]);

  useEffect(() => {
    if (!campaign || campaign.status !== 'running') return;
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [campaign, fetchProgress]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Loading...</div>;
  }

  if (!campaign) {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-red-500">Campaign not found.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
        ← Back to Campaigns
      </Link>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{campaign.keyword}</h1>
            <a
              href={campaign.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              {campaign.website}
            </a>
          </div>
          <StatusBadge status={campaign.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-gray-600">
          <div><span className="font-medium">Visits:</span> {campaign.required_visits}</div>
          <div><span className="font-medium">CTR:</span> {campaign.ctr}%</div>
          <div><span className="font-medium">Min Dwell:</span> {campaign.min_dwell_seconds}s</div>
          <div><span className="font-medium">Max Dwell:</span> {campaign.max_dwell_seconds}s</div>
        </div>
      </div>

      {progress && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Progress</h2>
          <div className="mb-4">
            <ProgressBar
              completed={progress.completed + progress.failed}
              total={progress.total}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-4">
            <div className="bg-gray-50 rounded p-3 text-center">
              <p className="text-gray-500 text-xs">Pending</p>
              <p className="text-lg font-bold text-gray-700">{progress.pending}</p>
            </div>
            <div className="bg-blue-50 rounded p-3 text-center">
              <p className="text-blue-500 text-xs">Running</p>
              <p className="text-lg font-bold text-blue-700">{progress.running}</p>
            </div>
            <div className="bg-green-50 rounded p-3 text-center">
              <p className="text-green-500 text-xs">Completed</p>
              <p className="text-lg font-bold text-green-700">{progress.completed}</p>
            </div>
            <div className="bg-red-50 rounded p-3 text-center">
              <p className="text-red-500 text-xs">Failed</p>
              <p className="text-lg font-bold text-red-700">{progress.failed}</p>
            </div>
          </div>
          {progress.avgDwellSeconds !== null && (
            <p className="text-sm text-gray-500 mt-3">
              Avg dwell time: <span className="font-medium">{progress.avgDwellSeconds}s</span>
            </p>
          )}
          {campaign.status === 'running' && (
            <p className="text-xs text-gray-400 mt-2">Auto-refreshing every 5 seconds…</p>
          )}
          {campaign.status === 'completed' && (
            <p className="text-xs text-green-600 mt-2 font-medium">Campaign completed ✓</p>
          )}
        </div>
      )}
    </div>
  );
}
