import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';
import { extractMakeAssistantText, parseMakeWebhookResponse } from '@/lib/make-webhook';

export const runtime = 'nodejs';

type ChatPayload = {
  sessionId?: number;
  message?: string;
};

const getTitleFromMessage = (message: string) =>
  message.replace(/\s+/g, ' ').trim().slice(0, 60);

export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ChatPayload;
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    let sessionId = body.sessionId;
    if (sessionId) {
      const sessions = await query<{ id: number }>(
        'SELECT id FROM `ChatSession` WHERE id = ? AND userId = ?',
        [sessionId, authUser.id],
      );
      if (sessions.length === 0) {
        return NextResponse.json({ error: 'Invalid session.' }, { status: 404 });
      }
    } else {
      const title = getTitleFromMessage(message);
      const sessionResult = await execute<ResultSetHeader>(
        'INSERT INTO `ChatSession` (userId, title) VALUES (?, ?)',
        [authUser.id, title],
      );
      sessionId = sessionResult.insertId;
    }

    await execute<ResultSetHeader>(
      'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)',
      [sessionId, 'USER', message],
    );

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Make webhook is not configured.' }, { status: 500 });
    }

    const users = await query<{ id: number; email: string; name: string | null }>(
      'SELECT id, email, name FROM `User` WHERE id = ?',
      [authUser.id],
    );
    const user = users[0] || { id: authUser.id, email: '', name: null };

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MAKE_WEBHOOK_API_KEY
          ? { 'x-make-apikey': process.env.MAKE_WEBHOOK_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        message,
        threadId: `user-${authUser.id}`,
        user,
      }),
    });

    const raw = await webhookResponse.text();
    const parsed = parseMakeWebhookResponse(raw);
    const assistantText = extractMakeAssistantText(raw, parsed) || 'Unable to get response.';

    await execute<ResultSetHeader>(
      'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)',
      [sessionId, 'ASSISTANT', assistantText],
    );

    await execute<ResultSetHeader>(
      'UPDATE `ChatSession` SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [sessionId],
    );

    return NextResponse.json({
      sessionId,
      reply: assistantText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send chat message', details: String(error) },
      { status: 500 },
    );
  }
}
