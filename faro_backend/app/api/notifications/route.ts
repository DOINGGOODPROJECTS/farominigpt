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
    const notifications = await query<Record<string, unknown>>('SELECT * FROM `Notification`');
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const userById = indexBy(users, (item) => item.id as number);

    const payload = notifications.map((notification) => ({
      ...notification,
      user: userById.get(notification.userId as number) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch notifications', details: String(error) }, { status: 500 });
  }
}