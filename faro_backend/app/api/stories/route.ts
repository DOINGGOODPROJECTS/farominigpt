import { NextResponse } from 'next/server';
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

type CreateStoryPayload = {
  title?: string;
  city?: string;
  summary?: string;
  outcomes?: string[];
  body?: string;
  imageUrl?: string;
};

export async function GET() {
  const stories = await query<StoryRow>(
    `SELECT s.*, u.name as authorName
     FROM \`Story\` s
     JOIN \`User\` u ON u.id = s.userId
     WHERE s.isPublic = TRUE
     ORDER BY s.createdAt DESC`,
  );

  const payload = stories.map((story) => ({
    ...story,
    outcomes: story.outcomes ? JSON.parse(story.outcomes) : [],
  }));

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreateStoryPayload;
  const title = body.title?.trim();
  const city = body.city?.trim();
  const summary = body.summary?.trim();
  const outcomes = body.outcomes ?? [];
  const storyBody = body.body?.trim();
  const imageUrl = body.imageUrl?.trim() || null;

  if (!title || !city || !summary || !storyBody) {
    return NextResponse.json(
      { error: 'Title, city, summary, and story body are required.' },
      { status: 400 },
    );
  }

  const outcomesJson = outcomes.length > 0 ? JSON.stringify(outcomes) : null;

  const result = await execute<ResultSetHeader>(
    `INSERT INTO \`Story\` (userId, title, city, summary, outcomes, body, imageUrl, isPublic)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [user.id, title, city, summary, outcomesJson, storyBody, imageUrl],
  );

  return NextResponse.json({ id: result.insertId });
}
