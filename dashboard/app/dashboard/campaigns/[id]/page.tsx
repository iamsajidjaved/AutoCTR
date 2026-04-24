'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Pause as PauseIcon,
  Play,
  RotateCw,
  Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import AppShell from '@/components/AppShell';
import Card from '@/components/Card';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/StatusBadge';
import VisitsTable from '@/components/VisitsTable';

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
  const [pageError, setPageError] = useState('');

  const fetchProgress = useCallback(async () => {
    try {
      const res = await api.get(`/api/campaigns/${id}/progress`);
      setCampaign(res.data.campaign);
      setProgress(res.data.progress);
      setPageError('');
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      if (status === 404) setPageError('Campaign not found.');
      else if (status !== 401) setPageError(msg || 'Failed to load campaign.');
    }
  }, [id]);

  useEffect(() => {
    fetchProgress().finally(() => setLoading(false));
  }, [fetchProgress]);

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

  async function doDelete() {
    if (!confirm('Delete this campaign? All visit data will be permanently removed.')) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/campaigns/${id}`);
      router.replace('/dashboard/campaigns');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      alert(msg || 'Delete failed');
      setActionLoading(false);
    }
  }

  return (
    <AppShell title="Campaign" subtitle={campaign?.keyword}>
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors mb-5"
      >
        <ArrowLeft size={14} />
        Back to Campaigns
      </Link>

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : pageError ? (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
          {pageError}
        </div>
      ) : campaign && (
        <div className="space-y-6">
          <Card>
            <div className="flex justify-between items-start gap-4 flex-wrap mb-5">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-fg mb-1.5 truncate">{campaign.keyword}</h2>
                <a
                  href={campaign.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
                >
                  {campaign.website}
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={campaign.status} size="md" />
                {campaign.status === 'pending' && (
                  <button onClick={() => doAction('activate')} disabled={actionLoading} className="btn-primary text-sm">
                    <Play size={14} /> Start
                  </button>
                )}
                {campaign.status === 'running' && (
                  <button onClick={() => doAction('pause')} disabled={actionLoading} className="btn text-sm bg-warning/10 text-warning hover:bg-warning/20 px-3.5 py-2">
                    <PauseIcon size={14} /> Pause
                  </button>
                )}
                {(campaign.status === 'paused' || campaign.status === 'completed') && (
                  <button onClick={() => doAction('restart')} disabled={actionLoading} className="btn text-sm bg-success/10 text-success hover:bg-success/20 px-3.5 py-2">
                    <RotateCw size={14} /> Restart
                  </button>
                )}
                {campaign.status !== 'running' && (
                  <button onClick={doDelete} disabled={actionLoading} className="btn-danger text-sm">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <InfoTile label="Total Visits" value={campaign.required_visits.toLocaleString()} />
              <InfoTile label="CTR" value={`${campaign.ctr}%`} />
              <InfoTile label="Duration" value={`${campaign.campaign_duration_days} day${campaign.campaign_duration_days !== 1 ? 's' : ''}`} />
              <InfoTile label="Mobile Traffic" value={`${campaign.mobile_desktop_ratio}%`} />
              {campaign.initial_daily_visits != null && (
                <>
                  <InfoTile label="Day 1 Visits" value={campaign.initial_daily_visits.toLocaleString()} />
                  <InfoTile label="Daily Increase" value={`${Number(campaign.daily_increase_pct)}%`} />
                </>
              )}
              <InfoTile label="Min Dwell" value={`${campaign.min_dwell_seconds}s`} />
              <InfoTile label="Max Dwell" value={`${campaign.max_dwell_seconds}s`} />
            </div>
          </Card>

          {progress && (
            <Card title="Visit progress" subtitle={
              campaign.status === 'running' ? 'Auto-refreshing every 5 seconds' : undefined
            }>
              <div className="mb-6">
                <ProgressBar completed={progress.completed + progress.failed} total={progress.total} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <ProgressTile label="Pending" value={progress.pending} tone="muted" />
                <ProgressTile label="Running" value={progress.running} tone="info" />
                <ProgressTile label="Completed" value={progress.completed} tone="success" />
                <ProgressTile label="Failed" value={progress.failed} tone="danger" />
              </div>
              {progress.avgDwellSeconds !== null && (
                <p className="text-sm text-muted mt-5">
                  Avg dwell time: <span className="text-fg font-semibold">{progress.avgDwellSeconds}s</span>
                </p>
              )}
            </Card>
          )}

          <VisitsTable campaignId={id} autoRefresh={campaign.status === 'running'} />
        </div>
      )}
    </AppShell>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3">
      <p className="label-xs">{label}</p>
      <p className="text-fg font-semibold mt-1">{value}</p>
    </div>
  );
}

function ProgressTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'muted' | 'info' | 'success' | 'danger';
}) {
  const toneCls = {
    muted: 'bg-surface-2 text-muted',
    info: 'bg-info/10 text-info',
    success: 'bg-success/10 text-success',
    danger: 'bg-danger/10 text-danger',
  }[tone];
  return (
    <div className={`rounded-lg p-3 text-center ${toneCls}`}>
      <p className="text-xs mb-1 opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
