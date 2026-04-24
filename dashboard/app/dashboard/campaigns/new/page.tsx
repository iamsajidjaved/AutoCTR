'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import NewCampaignForm from '@/components/NewCampaignForm';

export default function NewCampaignPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">New Campaign</h1>
      <NewCampaignForm />
    </div>
  );
}
