'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, logout } from '@/lib/auth';
import api from '@/lib/api';
import CampaignCard from '@/components/CampaignCard';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .get('/api/campaigns')
      .then((res) => setCampaigns(res.data))
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Campaigns</h1>
        <div className="flex gap-3">
          <Link
            href="/dashboard/campaigns/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + New Campaign
          </Link>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Logout
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading campaigns...</p>}

      {!loading && campaigns.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-3">No campaigns yet.</p>
          <Link
            href="/dashboard/campaigns/new"
            className="text-blue-600 hover:underline text-sm"
          >
            Create your first campaign →
          </Link>
        </div>
      )}

      <div className="grid gap-4">
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} />
        ))}
      </div>
    </div>
  );
}
