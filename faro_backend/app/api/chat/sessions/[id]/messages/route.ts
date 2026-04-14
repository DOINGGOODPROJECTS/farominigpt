import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

type MessageRow = {
  id: number;
  sessionId: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: Date;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let params: { id: string };
  if (context.params instanceof Promise) {
    params = await context.params;
  } else {
    params = context.params;
  }

  if (!/^\d+$/.test(params.id)) {
    return NextResponse.json(
      { error: `Invalid session id: ${params.id}` },
      { status: 400 },
    );
  }
  const sessionId = Number(params.id);

  try {
    const sessions = await query<{ id: number }>(
      'SELECT id FROM `ChatSession` WHERE id = ? AND userId = ?',
      [sessionId, authUser.id],
    );
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const messages = await query<MessageRow>(
      'SELECT id, sessionId, role, content, createdAt FROM `ChatMessage` WHERE sessionId = ? ORDER BY createdAt ASC',
      [sessionId],
    );

    return NextResponse.json(messages);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: String(error) },
      { status: 500 },
    );
  }
}
