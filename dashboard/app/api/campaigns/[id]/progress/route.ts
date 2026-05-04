import { NextRequest, NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const campaignService = require('../../../../../../src/services/campaignService');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const campaignCompletionService = require('../../../../../../src/services/campaignCompletionService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const campaign = await campaignService.getCampaign(id, user.id);
    const progress = await campaignCompletionService.getProgress(campaign.id);
    return NextResponse.json({ campaign, progress });
  } catch (err) {
    return toErrorResponse(err);
  }
}
