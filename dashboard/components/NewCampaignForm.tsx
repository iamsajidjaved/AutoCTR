'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface FormData {
  website: string;
  keyword: string;
  campaign_duration_days: number;
  initial_daily_visits: number;
  daily_increase_pct: number;
  ctr: number;
  mobile_desktop_ratio: number;
  min_dwell_seconds: number;
  max_dwell_seconds: number;
}

function computeTotal(initial: number, days: number, pct: number): number {
  let total = 0;
  for (let d = 0; d < days; d++) {
    total += Math.round(initial * Math.pow(1 + pct / 100, d));
  }
  return total;
}

export default function NewCampaignForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    website: '',
    keyword: '',
    campaign_duration_days: 1,
    initial_daily_visits: 100,
    daily_increase_pct: 0,
    ctr: 10,
    mobile_desktop_ratio: 50,
    min_dwell_seconds: 30,
    max_dwell_seconds: 120,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const totalVisits = useMemo(
    () => computeTotal(form.initial_daily_visits, form.campaign_duration_days, form.daily_increase_pct),
    [form.initial_daily_visits, form.campaign_duration_days, form.daily_increase_pct]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === 'number' || type === 'range'
          ? name === 'daily_increase_pct'
            ? parseFloat(value) || 0
            : parseInt(value, 10)
          : value,
    }));
  }

  function validate(): string | null {
    try { new URL(form.website); } catch { return 'Please enter a valid URL (e.g. https://example.com)'; }
    if (!form.keyword.trim()) return 'Keyword is required';
    if (!Number.isInteger(form.campaign_duration_days) || form.campaign_duration_days < 1 || form.campaign_duration_days > 365)
      return 'Campaign duration must be between 1 and 365 days';
    if (!Number.isInteger(form.initial_daily_visits) || form.initial_daily_visits < 1 || form.initial_daily_visits > 10000)
      return 'Day 1 visits must be between 1 and 10,000';
    if (isNaN(form.daily_increase_pct) || form.daily_increase_pct < 0 || form.daily_increase_pct > 100)
      return 'Daily increase % must be between 0 and 100';
    if (form.ctr < 1 || form.ctr > 100) return 'CTR must be between 1% and 100%';
    if (form.mobile_desktop_ratio < 0 || form.mobile_desktop_ratio > 100) return 'Mobile % must be between 0 and 100';
    if (form.min_dwell_seconds < 10 || form.min_dwell_seconds > 1800) return 'Min dwell must be between 10 and 1800 seconds';
    if (form.max_dwell_seconds < form.min_dwell_seconds) return 'Max dwell must be >= min dwell';
    if (form.max_dwell_seconds > 1800) return 'Max dwell cannot exceed 1800 seconds';
    if (totalVisits > 1000000) return `Total visits (${totalVisits.toLocaleString()}) exceeds 1,000,000 limit`;
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError('');
    setLoading(true);
    try {
      const createRes = await api.post('/api/campaigns', {
        website: form.website,
        keyword: form.keyword,
        campaign_duration_days: Math.round(form.campaign_duration_days),
        initial_daily_visits: Math.round(form.initial_daily_visits),
        daily_increase_pct: form.daily_increase_pct,
        ctr: Math.round(form.ctr),
        mobile_desktop_ratio: Math.round(form.mobile_desktop_ratio),
        min_dwell_seconds: Math.round(form.min_dwell_seconds),
        max_dwell_seconds: Math.round(form.max_dwell_seconds),
      });
      const campaignId = createRes.data.id;
      await api.post(`/api/campaigns/${campaignId}/activate`);
      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(msg || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Website URL</label>
        <input
          type="text"
          name="website"
          value={form.website}
          onChange={handleChange}
          placeholder="https://example.com"
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Keyword</label>
        <input
          type="text"
          name="keyword"
          value={form.keyword}
          onChange={handleChange}
          placeholder="your target keyword"
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          required
        />
      </div>

      {/* Traffic Schedule */}
      <div className="rounded-lg border border-gray-700 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200">Traffic Schedule</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Duration (days)</label>
            <input
              type="number"
              name="campaign_duration_days"
              value={form.campaign_duration_days}
              onChange={handleChange}
              min={1}
              max={365}
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-600 mt-1">1 – 365 days</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Day 1 Visits</label>
            <input
              type="number"
              name="initial_daily_visits"
              value={form.initial_daily_visits}
              onChange={handleChange}
              min={1}
              max={10000}
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-600 mt-1">1 – 10,000 / day</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Daily Increase %</label>
            <input
              type="number"
              name="daily_increase_pct"
              value={form.daily_increase_pct}
              onChange={handleChange}
              min={0}
              max={100}
              step={0.1}
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-600 mt-1">Compound growth</p>
          </div>
        </div>

        {/* Total visits preview */}
        <div className="bg-gray-900 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-400">Estimated total visits</span>
          <span className={`text-lg font-bold ${totalVisits > 1000000 ? 'text-red-400' : 'text-blue-400'}`}>
            {totalVisits.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">CTR %</label>
          <input
            type="number"
            name="ctr"
            value={form.ctr}
            onChange={handleChange}
            min={1}
            max={100}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-600 mt-1">1 – 100%</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Mobile Traffic — <span className="text-blue-400">{form.mobile_desktop_ratio}%</span>
          </label>
          <input
            type="range"
            name="mobile_desktop_ratio"
            value={form.mobile_desktop_ratio}
            onChange={handleChange}
            min={0}
            max={100}
            className="w-full accent-blue-500 mt-2"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>0% Desktop</span>
            <span>100% Mobile</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Min Dwell Time (s)</label>
          <input
            type="number"
            name="min_dwell_seconds"
            value={form.min_dwell_seconds}
            onChange={handleChange}
            min={10}
            max={1800}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Dwell Time (s)</label>
          <input
            type="number"
            name="max_dwell_seconds"
            value={form.max_dwell_seconds}
            onChange={handleChange}
            min={form.min_dwell_seconds}
            max={1800}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || totalVisits > 1000000}
        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors text-sm font-semibold"
      >
        {loading ? 'Creating Campaign...' : 'Create & Activate Campaign'}
      </button>
    </form>
  );
}
