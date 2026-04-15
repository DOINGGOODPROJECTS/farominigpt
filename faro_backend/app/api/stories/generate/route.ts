import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-session';
import { callGemini } from '@/lib/gemini';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Atlas, an AI-powered decision intelligence assistant for underrepresented entrepreneurs relocating to U.S. cities.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "title": string,
  "city": string,
  "summary": string,
  "outcomes": string[] (exactly 3 short strings),
  "body": string
}

Stories should be realistic, grounded, and aligned with relocation decisions (cost, networks, incentives).
`.trim();

type GeneratePayload = {
  prompt?: string;
};

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

  try {
    const text = await callGemini(trimmed, {}, [], SYSTEM_INSTRUCTION);

    let story;
    try {
      story = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Story response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(story);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate story.', details: String(error) },
      { status: 500 },
    );
  }
}
