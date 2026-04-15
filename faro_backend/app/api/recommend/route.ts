import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini } from '@/lib/gemini';
import { parseAiJson } from '@/lib/parse-ai-json';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Faro, an AI decision engine that recommends U.S. cities for underrepresented entrepreneurs.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "cities": Array<{
    "name": string,
    "score": number (0-100 integer),
    "why": string (1-2 sentences, actionable and specific)
  }>,
  "followUps"?: string[]
}

Rules:
- Provide 3 to 6 cities.
- If key context is missing, include "followUps" with up to 5 short clarifying questions.
`.trim();

type RecommendPayload = {
  industry?: string;
  stage?: string;
  budget?: number;
  timeline?: string;
  priorities?: string[];
  targetCustomer?: string;
  shortlistCities?: string[];
  notes?: string;
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as RecommendPayload;

    const message = JSON.stringify({
      industry: body.industry || null,
      stage: body.stage || null,
      budget: Number.isFinite(body.budget) ? body.budget : null,
      timeline: body.timeline || null,
      priorities: Array.isArray(body.priorities) ? body.priorities.filter(Boolean) : [],
      targetCustomer: body.targetCustomer || null,
      shortlistCities: Array.isArray(body.shortlistCities) ? body.shortlistCities.filter(Boolean) : [],
      notes: body.notes || null,
    }, null, 2);

    const text = await callGemini(message, {}, [], SYSTEM_INSTRUCTION);

    let json: unknown;
    try {
      json = parseAiJson(text);
    } catch {
      return NextResponse.json(
        { error: 'Recommendation response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate recommendations', details: String(error) },
      { status: 500 },
    );
  }
}
