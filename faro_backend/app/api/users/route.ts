import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { groupBy, indexBy } from '@/lib/db-helpers';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const profiles = await query<Record<string, unknown>>('SELECT * FROM `UserProfile`');
    const sessions = await query<Record<string, unknown>>('SELECT * FROM `Session`');
    const searches = await query<Record<string, unknown>>('SELECT * FROM `SavedSearch`');
    const favorites = await query<Record<string, unknown>>('SELECT * FROM `FavoriteCity`');
    const comparisons = await query<Record<string, unknown>>('SELECT * FROM `Comparison`');
    const chatSessions = await query<Record<string, unknown>>('SELECT * FROM `ChatSession`');
    const notifications = await query<Record<string, unknown>>('SELECT * FROM `Notification`');
    const reports = await query<Record<string, unknown>>('SELECT * FROM `Report`');

    const profileByUser = indexBy(profiles, (item) => item.userId as number);
    const sessionsByUser = groupBy(sessions, (item) => item.userId as number);
    const searchesByUser = groupBy(searches, (item) => item.userId as number);
    const favoritesByUser = groupBy(favorites, (item) => item.userId as number);
    const comparisonsByUser = groupBy(comparisons, (item) => item.userId as number);
    const chatSessionsByUser = groupBy(chatSessions, (item) => item.userId as number);
    const notificationsByUser = groupBy(notifications, (item) => item.userId as number);
    const reportsByUser = groupBy(reports, (item) => item.userId as number);

    const payload = users.map((user) => ({
      ...user,
      profile: profileByUser.get(user.id as number) ?? null,
      sessions: sessionsByUser.get(user.id as number) ?? [],
      searches: searchesByUser.get(user.id as number) ?? [],
      favorites: favoritesByUser.get(user.id as number) ?? [],
      comparisons: comparisonsByUser.get(user.id as number) ?? [],
      chatSessions: chatSessionsByUser.get(user.id as number) ?? [],
      notifications: notificationsByUser.get(user.id as number) ?? [],
      reports: reportsByUser.get(user.id as number) ?? [],
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users', details: String(error) }, { status: 500 });
  }
}