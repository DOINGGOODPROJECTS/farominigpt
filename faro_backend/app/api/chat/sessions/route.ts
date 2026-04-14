import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type SessionRow = {
  id: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  sessionId: number;
  content: string;
  createdAt: Date;
};

export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await query<SessionRow>(
      'SELECT id, title, createdAt, updatedAt FROM `ChatSession` WHERE userId = ? ORDER BY updatedAt DESC',
      [authUser.id],
    );

    if (sessions.length === 0) {
      return NextResponse.json([]);
    }

    const ids = sessions.map((session) => session.id);
    const placeholders = ids.map(() => '?').join(',');
    const messages = await query<MessageRow>(
      `SELECT sessionId, content, createdAt FROM \`ChatMessage\` WHERE sessionId IN (${placeholders}) ORDER BY createdAt DESC`,
      ids,
    );

    const lastBySession = new Map<number, MessageRow>();
    for (const message of messages) {
      if (!lastBySession.has(message.sessionId)) {
        lastBySession.set(message.sessionId, message);
      }
    }

    const payload = sessions.map((session) => ({
      ...session,
      lastMessage: lastBySession.get(session.id) || null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch chat sessions', details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim() || null;

    const result = await execute<ResultSetHeader>(
      'INSERT INTO `ChatSession` (userId, title) VALUES (?, ?)',
      [authUser.id, title],
    );

    return NextResponse.json({ id: result.insertId, title });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create chat session', details: String(error) },
      { status: 500 },
    );
  }
}
