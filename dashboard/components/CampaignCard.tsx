import Link from 'next/link';
import StatusBadge from './StatusBadge';

interface Campaign {
  id: string;
  keyword: string;
  website: string;
  required_visits: number;
  ctr: number;
  status: string;
  created_at: string;
}

interface CampaignCardProps {
  campaign: Campaign;
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <Link href={`/dashboard/campaigns/${campaign.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white cursor-pointer">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-semibold text-gray-800 truncate max-w-xs">{campaign.keyword}</p>
            <p className="text-sm text-gray-500 truncate max-w-xs">{campaign.website}</p>
          </div>
          <StatusBadge status={campaign.status} />
        </div>
        <div className="flex gap-4 text-sm text-gray-600 mt-2">
          <span>Visits: <span className="font-medium">{campaign.required_visits}</span></span>
          <span>CTR: <span className="font-medium">{campaign.ctr}%</span></span>
        </div>
      </div>
    </Link>
  );
}
