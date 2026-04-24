'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  MousePointerClick,
  Pause as PauseIcon,
  Plus,
  RefreshCw,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import AppShell from '@/components/AppShell';
import Card from '@/components/Card';
import KpiCard from '@/components/KpiCard';
import StatusBadge from '@/components/StatusBadge';
import CampaignTable from '@/components/CampaignTable';
import AreaTrend from '@/components/charts/AreaTrend';
import StackedBars from '@/components/charts/StackedBars';
import LineTrend from '@/components/charts/LineTrend';
import Donut from '@/components/charts/Donut';
import HorizontalBars from '@/components/charts/HorizontalBars';
import Heatmap from '@/components/charts/Heatmap';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

interface Overview {
  campaignCounts: { status: string; count: number }[];
  visitCounts: { status: string; type: string; device: string; count: number }[];
  avgDwellSeconds: number | null;
  dailySeries: {
    day: string;
    impressions: number;
    clicks: number;
    completed: number;
    failed: number;
  }[];
  heatmap: { dow: number; hour: number; count: number }[];
  topCampaigns: {
    id: string;
    keyword: string;
    website: string;
    status: string;
    required_visits: number;
    completed: number;
    failed: number;
  }[];
  recentVisits: {
    id: string;
    type: 'impression' | 'click';
    device: 'mobile' | 'desktop';
    status: string;
    ip: string | null;
    completed_at: string | null;
    keyword: string;
    campaign_id: string;
  }[];
  proxyDistribution: { ip: string; count: number }[];
}

const fmt = new Intl.NumberFormat('en-US');

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    month: 'short',
    day: '2-digit',
  });
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchAll() {
    try {
      setRefreshing(true);
      const [c, o] = await Promise.all([
        api.get('/api/campaigns'),
        api.get('/api/analytics/overview'),
      ]);
      setCampaigns(c.data);
      setOverview(o.data);
    } catch {
      /* handled by interceptor */
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, running: 0, paused: 0, completed: 0, failed: 0 };
    overview?.campaignCounts?.forEach((row) => {
      if (row.status in c) (c as Record<string, number>)[row.status] = row.count;
    });
    return c;
  }, [overview]);

  const visitTotals = useMemo(() => {
    const t = {
      total: 0, completed: 0, failed: 0, pending: 0, running: 0,
      mobile: 0, desktop: 0, clicks: 0, impressions: 0,
    };
    overview?.visitCounts?.forEach((row) => {
      t.total += row.count;
      (t as Record<string, number>)[row.status] = ((t as Record<string, number>)[row.status] || 0) + row.count;
      if (row.status === 'completed') {
        if (row.device === 'mobile') t.mobile += row.count; else t.desktop += row.count;
        if (row.type === 'click') t.clicks += row.count; else t.impressions += row.count;
      }
    });
    return t;
  }, [overview]);

  const ctrActual = visitTotals.impressions + visitTotals.clicks > 0
    ? Math.round((visitTotals.clicks / (visitTotals.impressions + visitTotals.clicks)) * 100 * 10) / 10
    : 0;

  const dailySeries = useMemo(() => {
    return (overview?.dailySeries || []).map((d) => ({
      day: formatDay(d.day),
      impressions: d.impressions,
      clicks: d.clicks,
      completed: d.completed,
      failed: d.failed,
      ctr: d.impressions + d.clicks > 0
        ? Math.round((d.clicks / (d.impressions + d.clicks)) * 1000) / 10
        : 0,
    }));
  }, [overview]);

  const completedSpark = dailySeries.map((d) => d.completed);
  const clicksSpark = dailySeries.map((d) => d.clicks);
  const ctrSpark = dailySeries.map((d) => d.ctr);

  return (
    <AppShell
      title="Overview"
      subtitle="Real-time analytics for all your CTR campaigns"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="btn-secondary text-xs"
            aria-label="Refresh"
          >
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
      {loading ? (
        <p className="text-muted text-sm">Loading dashboard…</p>
      ) : (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Active Campaigns" value={counts.running} hint={`${campaigns.length} total`} icon={Activity} accent="info" />
            <KpiCard label="Completed Visits" value={fmt.format(visitTotals.completed)} hint={`${fmt.format(visitTotals.pending)} pending`} icon={CheckCircle2} accent="success" spark={completedSpark.length > 1 ? completedSpark : undefined} />
            <KpiCard label="Clicks" value={fmt.format(visitTotals.clicks)} hint={`${fmt.format(visitTotals.impressions)} impressions`} icon={MousePointerClick} accent="brand" spark={clicksSpark.length > 1 ? clicksSpark : undefined} />
            <KpiCard label="Actual CTR" value={`${ctrActual}%`} hint={`${counts.paused} paused · ${counts.completed} done`} icon={TrendingUp} accent="warning" spark={ctrSpark.length > 1 ? ctrSpark : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2" title="Visits over time" subtitle="Last 14 days · completed visits & failures">
              {dailySeries.length > 0 ? (
                <AreaTrend
                  data={dailySeries}
                  xKey="day"
                  series={[
                    { key: 'completed', label: 'Completed', color: 'rgb(var(--brand))' },
                    { key: 'failed', label: 'Failed', color: 'rgb(var(--danger))' },
                  ]}
                  height={280}
                />
              ) : <EmptyChart label="No completed visits yet" />}
            </Card>

            <Card title="Campaign status" subtitle="Distribution across all campaigns">
              <Donut
                centerLabel="Total"
                centerValue={fmt.format(campaigns.length)}
                data={[
                  { name: 'pending',   value: counts.pending,   color: 'rgb(var(--subtle))' },
                  { name: 'running',   value: counts.running,   color: 'rgb(var(--info))' },
                  { name: 'paused',    value: counts.paused,    color: 'rgb(var(--warning))' },
                  { name: 'completed', value: counts.completed, color: 'rgb(var(--success))' },
                  { name: 'failed',    value: counts.failed,    color: 'rgb(var(--danger))' },
                ]}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2" title="Clicks vs Impressions" subtitle="Daily breakdown by visit type">
              {dailySeries.length > 0 ? (
                <StackedBars
                  data={dailySeries}
                  xKey="day"
                  series={[
                    { key: 'impressions', label: 'Impressions', color: 'rgb(var(--info))' },
                    { key: 'clicks',      label: 'Clicks',      color: 'rgb(var(--brand))' },
                  ]}
                  height={280}
                />
              ) : <EmptyChart label="No data yet" />}
            </Card>

            <Card title="CTR trend" subtitle="Daily click-through rate">
              {dailySeries.length > 0 ? (
                <LineTrend data={dailySeries} xKey="day" yKey="ctr" label="CTR" yFormatter={(v) => `${v}%`} height={280} />
              ) : <EmptyChart label="No clicks yet" />}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Device split" subtitle="Mobile vs desktop completed visits">
              <Donut
                centerLabel="Visits"
                centerValue={fmt.format(visitTotals.mobile + visitTotals.desktop)}
                data={[
                  { name: 'mobile',  value: visitTotals.mobile,  color: 'rgb(var(--brand))' },
                  { name: 'desktop', value: visitTotals.desktop, color: 'rgb(var(--info))' },
                ]}
              />
            </Card>

            <Card
              className="lg:col-span-2"
              title="Top campaigns"
              subtitle="Ranked by completed visits"
              actions={<Link href="/dashboard/campaigns" className="text-xs text-brand hover:underline">View all →</Link>}
            >
              <HorizontalBars
                emptyMessage="Run a campaign to populate this chart"
                rows={(overview?.topCampaigns || []).map((c) => ({
                  label: c.keyword,
                  value: c.completed,
                  sub: `${c.required_visits.toLocaleString()} target · ${c.status}`,
                }))}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2" title="Activity heatmap" subtitle="Completed visits by day × hour (last 7 days, Asia/Dubai)">
              <Heatmap cells={overview?.heatmap || []} />
            </Card>

            <Card title="Source IP distribution" subtitle="Top exit IPs from rotating proxy pool">
              <HorizontalBars
                emptyMessage="No proxy traffic recorded yet"
                color="rgb(var(--info))"
                rows={(overview?.proxyDistribution || []).map((p) => ({ label: p.ip, value: p.count }))}
              />
              <p className="text-[10px] text-subtle mt-4">
                Geographic mapping requires IP geolocation enrichment (planned).
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2" title="Recent visits" subtitle="Last 10 completed or failed executions" noPadding>
              <RecentVisits visits={overview?.recentVisits || []} />
            </Card>

            <div className="space-y-4">
              <KpiCard label="Avg dwell" value={overview?.avgDwellSeconds != null ? `${Math.round(overview.avgDwellSeconds)}s` : '—'} hint="Across completed visits" icon={Activity} accent="info" />
              <KpiCard
                label="Mobile share"
                value={`${
                  visitTotals.mobile + visitTotals.desktop > 0
                    ? Math.round((visitTotals.mobile / (visitTotals.mobile + visitTotals.desktop)) * 100)
                    : 0
                }%`}
                hint={`${fmt.format(visitTotals.mobile)} mobile visits`}
                icon={Smartphone}
                accent="brand"
              />
              <KpiCard label="Paused" value={counts.paused} hint="Awaiting restart" icon={PauseIcon} accent="warning" />
            </div>
          </div>

          <Card title="All campaigns" subtitle={`${campaigns.length} total`} noPadding>
            <CampaignTable campaigns={campaigns} onRefresh={fetchAll} />
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[280px] flex items-center justify-center text-sm text-muted border border-dashed border-border rounded-lg">
      {label}
    </div>
  );
}

function RecentVisits({ visits }: { visits: Overview['recentVisits'] }) {
  if (!visits.length) {
    return <p className="text-sm text-muted py-10 text-center">No visits yet — start a campaign.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {visits.map((v) => (
        <li key={v.id} className="px-5 py-2.5 flex items-center gap-3 text-xs hover:bg-surface-hover/40 transition-colors">
          <span className={`w-2 h-2 rounded-full shrink-0 ${v.status === 'completed' ? 'bg-success' : 'bg-danger'}`} />
          <Link href={`/dashboard/campaigns/${v.campaign_id}`} className="text-fg font-medium truncate min-w-0 flex-1 hover:text-brand">
            {v.keyword}
          </Link>
          <span className="text-muted capitalize hidden sm:inline">{v.type}</span>
          <span className="text-subtle hidden md:inline capitalize">{v.device}</span>
          <span className="text-subtle font-mono hidden lg:inline">{v.ip || '—'}</span>
          <StatusBadge status={v.status} />
          <span className="text-subtle text-[11px] tabular-nums whitespace-nowrap">
            {v.completed_at
              ? new Date(v.completed_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}
