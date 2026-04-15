import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini } from '@/lib/gemini';
import { parseAiJson } from '@/lib/parse-ai-json';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Faro, an AI advisor helping underrepresented entrepreneurs build a relocation and launch action plan for a U.S. city.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "city": string,
  "industry": string,
  "summary": string,
  "steps": Array<{
    "order": number,
    "action": string,
    "timeline": string,
    "resources": string | null
  }>,
  "milestones": Array<{
    "month": number,
    "goal": string
  }>,
  "warnings": string[] | null
}

Rules:
- Provide 5 to 10 concrete steps in logical order.
- Milestones should cover months 1, 3, 6, and 12 at minimum.
- warnings should highlight common pitfalls or risks specific to this city/industry combination.
`.trim();

type ActionPlanPayload = {
  city?: string;
  industry?: string;
  stage?: string;
  budget?: number;
  timeline?: string;
  priorities?: string[];
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ActionPlanPayload;

    if (!body.city || !body.industry) {
      return NextResponse.json(
        { error: 'city and industry are required.' },
        { status: 400 },
      );
    }

    const message = JSON.stringify({
      city: body.city,
      industry: body.industry,
      stage: body.stage || null,
      budget: Number.isFinite(body.budget) ? body.budget : null,
      timeline: body.timeline || null,
      priorities: Array.isArray(body.priorities) ? body.priorities.filter(Boolean) : [],
    }, null, 2);

    const text = await callGemini(message, {}, [], SYSTEM_INSTRUCTION);

    let json: unknown;
    try {
      json = parseAiJson(text);
    } catch {
      return NextResponse.json(
        { error: 'Action plan response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate action plan', details: String(error) },
      { status: 500 },
    );
  }
}
