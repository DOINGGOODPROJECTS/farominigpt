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
    const userProfiles = await query<Record<string, unknown>>('SELECT * FROM `UserProfile`');
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const userById = indexBy(users, (item) => item.id as number);

    const payload = userProfiles.map((profile) => ({
      ...profile,
      user: userById.get(profile.userId as number) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch user profiles', details: String(error) }, { status: 500 });
  }
}