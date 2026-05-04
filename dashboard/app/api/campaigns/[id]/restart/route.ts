import { NextRequest, NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const campaignService = require('../../../../../../src/services/campaignService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const result = await campaignService.restartCampaign(id, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
