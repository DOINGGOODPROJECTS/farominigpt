import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

export async function DELETE(
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

  const sessionId = Number(params.id);
  if (!sessionId || Number.isNaN(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }

  try {
    const sessions = await query<{ id: number }>(
      'SELECT id FROM `ChatSession` WHERE id = ? AND userId = ?',
      [sessionId, authUser.id],
    );
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await execute<ResultSetHeader>('DELETE FROM `ChatSession` WHERE id = ?', [
      sessionId,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete chat session', details: String(error) },
      { status: 500 },
    );
  }
}
