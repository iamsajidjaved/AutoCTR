import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/server-auth';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const authService = require('@server/services/authService');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await authService.register(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
