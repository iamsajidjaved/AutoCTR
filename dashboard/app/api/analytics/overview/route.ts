import { NextRequest, NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const analyticsService = require('../../../../../src/services/analyticsService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const data = await analyticsService.getOverview(user.id);
    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
