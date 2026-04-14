import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type PostPayload = {
  storyId?: number;
  message?: string;
};

type StoryRow = {
  id: number;
  title: string;
  city: string;
};

type AccountRow = {
  id: number;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as PostPayload;
  const storyId = Number(body.storyId);
  const message = body.message?.trim();
  if (!Number.isFinite(storyId) || !message) {
    return NextResponse.json({ error: 'Story and message are required.' }, { status: 400 });
  }

  const stories = await query<StoryRow>(
    'SELECT id, title, city FROM `Story` WHERE id = ?',
    [storyId],
  );
  const story = stories[0];
  if (!story) {
    return NextResponse.json({ error: 'Story not found.' }, { status: 404 });
  }

  const accounts = await query<AccountRow>(
    'SELECT id, accessToken, refreshToken, expiresAt FROM `SocialAccount` WHERE userId = ? AND provider = \'X\'',
    [user.id],
  );
  const account = accounts[0];
  if (!account) {
    return NextResponse.json({ error: 'Connect X to post.' }, { status: 400 });
  }

  const hasCredentials = Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);

  const payload = {
    storyId,
    message,
    title: story.title,
    city: story.city,
  };

  const result = await execute<ResultSetHeader>(
    `INSERT INTO \`SocialPost\` (userId, storyId, provider, status, payload)
     VALUES (?, ?, 'X', ?, ?)`,
    [user.id, storyId, hasCredentials ? 'PENDING' : 'PENDING', JSON.stringify(payload)],
  );

  if (!hasCredentials) {
    return NextResponse.json({
      queued: true,
      postId: result.insertId,
      message: 'Queued. X credentials not configured yet.',
    });
  }

  return NextResponse.json({
    queued: true,
    postId: result.insertId,
    message: 'Queued for posting to X.',
  });
}
