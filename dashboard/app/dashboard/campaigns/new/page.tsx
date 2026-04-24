'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import NewCampaignForm from '@/components/NewCampaignForm';

export default function NewCampaignPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-white">New Campaign</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure and launch a new CTR simulation</p>
        </div>
        <div className="max-w-xl">
          <NewCampaignForm />
        </div>
      </main>
    </div>
  );
}
