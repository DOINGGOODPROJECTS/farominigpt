import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';
import { allowRequest } from '@/lib/rate-limit';
import { callGemini, type ConversationTurn, type UserProfile } from '@/lib/gemini';

export const runtime = 'nodejs';

type Payload = { sessionId?: number; message?: string };

export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!allowRequest(authUser.id, 1)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as Payload;
    const message = body.message?.trim();
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

    let sessionId = body.sessionId;
    if (sessionId) {
      const sessions = await query<{ id: number }>(
        'SELECT id FROM `ChatSession` WHERE id = ? AND userId = ?',
        [sessionId, authUser.id],
      );
      if (sessions.length === 0) return NextResponse.json({ error: 'Invalid session.' }, { status: 404 });
    } else {
      const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);
      const result = await execute<ResultSetHeader>(
        'INSERT INTO `ChatSession` (userId, title) VALUES (?, ?)',
        [authUser.id, title],
      );
      sessionId = result.insertId;
    }

    await execute<ResultSetHeader>(
      'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)',
      [sessionId, 'USER', message],
    );

    // Fetch user profile for personalised responses
    const profiles = await query<{
      industry: string | null;
      stage: string | null;
      budgetRange: string | null;
      relocationWindow: string | null;
      priorities: string | null;
      currentLocation: string | null;
    }>('SELECT industry, stage, budgetRange, relocationWindow, priorities, currentLocation FROM `UserProfile` WHERE userId = ? LIMIT 1', [authUser.id]);
    const profile: UserProfile = profiles[0] ?? {};

    // Fetch conversation history (exclude the message we just inserted)
    const rows = await query<{ role: string; content: string }>(
      'SELECT role, content FROM `ChatMessage` WHERE sessionId = ? ORDER BY createdAt ASC',
      [sessionId],
    );
    const history: ConversationTurn[] = rows
      .slice(0, -1)
      .map((r) => ({
        role: r.role === 'ASSISTANT' ? ('model' as const) : ('user' as const),
        text: r.content,
      }));

    const reply = await callGemini(message, profile, history);

    await execute<ResultSetHeader>(
      'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)',
      [sessionId, 'ASSISTANT', reply],
    );
    await execute<ResultSetHeader>(
      'UPDATE `ChatSession` SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [sessionId],
    );

    return NextResponse.json({ sessionId, reply });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to complete chat', details: String(error) },
      { status: 500 },
    );
  }
}
