import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini } from '@/lib/gemini';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Atlas, an AI decision engine that recommends U.S. cities for underrepresented entrepreneurs.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "cities": Array<{ "name": string, "score": number (0-100 integer), "why": string (1-2 sentences) }>,
  "followUps"?: string[]
}

Rules:
- Provide 3 to 6 cities.
- If key context is missing, include "followUps" with up to 5 short clarifying questions.
`.trim();

type RecommendationRequest = {
  industry?: string;
  stage?: string;
  budget?: number;
  timeline?: string;
  priorities?: string[];
  targetCustomer?: string;
  shortlistCities?: string[];
  notes?: string;
};

type RecommendationCity = {
  name: string;
  score: number;
  why: string;
};

type RecommendationResponse = {
  cities: RecommendationCity[];
  followUps?: string[];
};

const buildMessage = (input: RecommendationRequest): string => {
  const priorities = Array.isArray(input.priorities) ? input.priorities.filter(Boolean) : [];
  const shortlistCities = Array.isArray(input.shortlistCities)
    ? input.shortlistCities.filter(Boolean)
    : [];

  return JSON.stringify(
    {
      industry: input.industry || null,
      stage: input.stage || null,
      budget: Number.isFinite(input.budget) ? input.budget : null,
      timeline: input.timeline || null,
      priorities,
      targetCustomer: input.targetCustomer || null,
      shortlistCities,
      notes: input.notes || null,
    },
    null,
    2,
  );
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as RecommendationRequest;
    const text = await callGemini(buildMessage(body), {}, [], SYSTEM_INSTRUCTION);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Recommendation response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(json as RecommendationResponse);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate recommendations', details: String(error) },
      { status: 500 },
    );
  }
}
