import { NextRequest, NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const campaignService = require('../../../../src/services/campaignService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const campaigns = await campaignService.listCampaigns(user.id);
    return NextResponse.json(campaigns);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const body = await req.json();
    const campaign = await campaignService.createCampaign(user.id, body);
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
