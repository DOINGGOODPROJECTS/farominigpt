import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { indexBy } from '@/lib/db-helpers';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await query<Record<string, unknown>>('SELECT * FROM `Session`');
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const userById = indexBy(users, (item) => item.id as number);

    const payload = sessions.map((session) => ({
      ...session,
      user: userById.get(session.userId as number) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions', details: String(error) }, { status: 500 });
  }
}