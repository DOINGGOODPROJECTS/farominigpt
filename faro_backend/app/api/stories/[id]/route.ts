import { NextResponse, type NextRequest } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type StoryRow = {
  id: number;
  userId: number;
  title: string;
  city: string;
  summary: string;
  outcomes: string | null;
  body: string;
  imageUrl: string | null;
  isPublic: number;
  createdAt: Date;
  updatedAt: Date;
  authorName?: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const storyId = Number(id);
  if (!Number.isFinite(storyId)) {
    return NextResponse.json({ error: 'Invalid story id' }, { status: 400 });
  }

  const stories = await query<StoryRow>(
    `SELECT s.*, u.name as authorName
     FROM \`Story\` s
     JOIN \`User\` u ON u.id = s.userId
     WHERE s.id = ?`,
    [storyId],
  );

  const story = stories[0];
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...story,
    outcomes: story.outcomes ? JSON.parse(story.outcomes) : [],
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const storyId = Number(id);
  if (!Number.isFinite(storyId)) {
    return NextResponse.json({ error: 'Invalid story id' }, { status: 400 });
  }

  const stories = await query<{ id: number; userId: number }>(
    'SELECT id, userId FROM `Story` WHERE id = ?',
    [storyId],
  );
  const story = stories[0];
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  if (story.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await execute<ResultSetHeader>('DELETE FROM `Story` WHERE id = ?', [storyId]);
  return NextResponse.json({ ok: true });
}
