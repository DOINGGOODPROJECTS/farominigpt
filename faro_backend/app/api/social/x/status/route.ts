import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

type AccountRow = {
  id: number;
  username: string | null;
};

export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await query<AccountRow>(
    'SELECT id, username FROM `SocialAccount` WHERE userId = ? AND provider = \'X\'',
    [user.id],
  );
  const account = accounts[0];
  return NextResponse.json({
    connected: Boolean(account),
    username: account?.username ?? null,
  });
}
