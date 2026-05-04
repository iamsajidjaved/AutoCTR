// Server-side JWT helper used by API route handlers.
// Mirrors the validation logic in src/middlewares/authenticate.js but returns
// either the user object or a NextResponse the route can short-circuit with.

import { NextRequest, NextResponse } from 'next/server';

// CommonJS interop — both modules live in src/ and are bundled into the
// serverless function via outputFileTracingIncludes (see next.config.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../src/config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const userModel = require('../../src/models/userModel');

export type AuthUser = {
  id: string;
  email: string;
  created_at: string;
};

export async function requireUser(req: NextRequest): Promise<AuthUser | NextResponse> {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string };
    const user = await userModel.findById(payload.sub);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safe } = user;
    return safe as AuthUser;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// Wrap a service-layer error into a JSON NextResponse using its `status` field
// when present (services throw `Error` decorated with `.status` and `.field`).
export function toErrorResponse(err: unknown): NextResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  if (e && typeof e === 'object' && typeof e.status === 'number') {
    const body: Record<string, unknown> = { error: e.message };
    if (e.field) body.field = e.field;
    return NextResponse.json(body, { status: e.status });
  }
  console.error(err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
