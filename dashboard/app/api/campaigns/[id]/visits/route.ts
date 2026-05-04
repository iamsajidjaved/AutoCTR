import { NextRequest, NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const campaignService = require('@server/services/campaignService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    const result = await campaignService.listVisits(id, user.id, query);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
