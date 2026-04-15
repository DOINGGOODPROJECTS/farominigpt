import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini } from '@/lib/gemini';
import { parseAiJson } from '@/lib/parse-ai-json';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Faro, an AI decision engine that compares U.S. cities for underrepresented entrepreneurs.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "city1": string,
  "city2": string,
  "summary": string,
  "verdict": string,
  "scores": { "city1": number (0-100 integer), "city2": number (0-100 integer) },
  "pros": { "city1": string[] (3-6 bullets), "city2": string[] (3-6 bullets) },
  "cons": { "city1": string[] (3-6 bullets), "city2": string[] (3-6 bullets) },
  "nextSteps"?: string[]
}
`.trim();

type CompareCitiesPayload = {
  city1?: string;
  city2?: string;
  industry?: string;
  budget?: string;
  priorities?: string;
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as CompareCitiesPayload;
    const city1 = body.city1?.trim();
    const city2 = body.city2?.trim();

    if (!city1 || !city2) {
      return NextResponse.json({ error: 'city1 and city2 are required.' }, { status: 400 });
    }

    const message = JSON.stringify({ city1, city2, industry: body.industry, budget: body.budget, priorities: body.priorities }, null, 2);
    const text = await callGemini(message, {}, [], SYSTEM_INSTRUCTION);

    let json: unknown;
    try {
      json = parseAiJson(text);
    } catch {
      return NextResponse.json(
        { error: 'Comparison response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to compare cities', details: String(error) },
      { status: 500 },
    );
  }
}
