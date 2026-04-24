'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface FormData {
  website: string;
  keyword: string;
  total_visits: number;
  ctr: number;
  mobile_desktop_ratio: number;
  min_dwell_seconds: number;
  max_dwell_seconds: number;
}

export default function NewCampaignForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    website: '',
    keyword: '',
    total_visits: 100,
    ctr: 10,
    mobile_desktop_ratio: 50,
    min_dwell_seconds: 30,
    max_dwell_seconds: 120,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  }

  function validate(): string | null {
    try {
      new URL(form.website);
    } catch {
      return 'Please enter a valid URL (e.g. https://example.com)';
    }
    if (!form.keyword.trim()) return 'Keyword is required';
    if (form.total_visits < 1 || form.total_visits > 100000)
      return 'Total visits must be between 1 and 100,000';
    if (form.ctr < 1 || form.ctr > 100) return 'CTR must be between 1% and 100%';
    if (form.mobile_desktop_ratio < 0 || form.mobile_desktop_ratio > 100)
      return 'Mobile % must be between 0 and 100';
    if (form.min_dwell_seconds < 10 || form.min_dwell_seconds > 1800)
      return 'Min dwell must be between 10 and 1800 seconds';
    if (form.max_dwell_seconds < form.min_dwell_seconds)
      return 'Max dwell must be >= min dwell';
    if (form.max_dwell_seconds > 1800) return 'Max dwell cannot exceed 1800 seconds';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const createRes = await api.post('/api/campaigns', {
        website: form.website,
        keyword: form.keyword,
        required_visits: form.total_visits,
        ctr: form.ctr,
        mobile_desktop_ratio: form.mobile_desktop_ratio,
        min_dwell_seconds: form.min_dwell_seconds,
        max_dwell_seconds: form.max_dwell_seconds,
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Total Visits</label>
          <input
            type="number"
            name="total_visits"
            value={form.total_visits}
            onChange={handleChange}
            min={1}
            max={100000}
            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-600 mt-1">1 – 100,000</p>
        </div>
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
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Mobile Traffic — <span className="text-blue-400">{form.mobile_desktop_ratio}%</span>
        </label>
        <input
          type="range"
          name="mobile_desktop_ratio"
          value={form.mobile_desktop_ratio}
          onChange={handleChange}
          min={0}
          max={100}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>0% (All Desktop)</span>
          <span>100% (All Mobile)</span>
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
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors text-sm font-semibold"
      >
        {loading ? 'Creating Campaign...' : 'Create & Activate Campaign'}
      </button>
    </form>
  );
}
