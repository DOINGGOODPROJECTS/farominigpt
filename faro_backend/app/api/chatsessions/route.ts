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
    const chatSessions = await query<Record<string, unknown>>('SELECT * FROM `ChatSession`');
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const messages = await query<Record<string, unknown>>('SELECT * FROM `ChatMessage`');

    const userById = indexBy(users, (item) => item.id as number);
    const messagesBySession = groupBy(messages, (item) => item.sessionId as number);

    const payload = chatSessions.map((session) => ({
      ...session,
      user: userById.get(session.userId as number) ?? null,
      messages: messagesBySession.get(session.id as number) ?? [],
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch chat sessions', details: String(error) }, { status: 500 });
  }
}