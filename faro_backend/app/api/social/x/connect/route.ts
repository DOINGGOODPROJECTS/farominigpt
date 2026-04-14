import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'X OAuth is not configured yet. Add credentials to enable.',
    },
    { status: 501 },
  );
}
