import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

type GeneratePayload = {
  prompt?: string;
};

const buildPrompt = (prompt: string) => `
You are Atlas, an AI-powered decision intelligence assistant for underrepresented entrepreneurs relocating to U.S. cities.
Generate a single story as JSON with the exact keys:
title (string), city (string), summary (string), outcomes (array of 3 short strings), body (string).
The story should be realistic, grounded, and aligned with relocation decisions (cost, networks, incentives).
Prompt: ${prompt}
Return only JSON.
`;

export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { prompt } = (await request.json()) as GeneratePayload;
  const trimmed = prompt?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
  }

  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  const webhookKey = process.env.MAKE_WEBHOOK_API_KEY;
  if (!webhookUrl || !webhookKey) {
    return NextResponse.json(
      { error: 'Story generation is not configured.' },
      { status: 503 },
    );
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-make-apikey': webhookKey,
    },
    body: JSON.stringify({ message: buildPrompt(trimmed) }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return NextResponse.json(
      { error: payload?.error || 'Failed to generate story.' },
      { status: response.status },
    );
  }

  const reply = payload?.reply || payload?.response || payload?.text;
  if (!reply) {
    return NextResponse.json({ error: 'No story returned.' }, { status: 500 });
  }

  let story;
  try {
    story = JSON.parse(reply);
  } catch {
    return NextResponse.json(
      { error: 'Story response was not valid JSON.', raw: reply },
      { status: 502 },
    );
  }

  return NextResponse.json(story);
}
