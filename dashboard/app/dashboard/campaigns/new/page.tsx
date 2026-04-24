'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/AppShell';
import NewCampaignForm from '@/components/NewCampaignForm';

export default function NewCampaignPage() {
  return (
    <AppShell title="New Campaign" subtitle="Configure a new CTR simulation campaign">
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors mb-5"
      >
        <ArrowLeft size={14} />
        Back to Campaigns
      </Link>

      <div className="max-w-3xl">
        <NewCampaignForm />
      </div>
    </AppShell>
  );
}
