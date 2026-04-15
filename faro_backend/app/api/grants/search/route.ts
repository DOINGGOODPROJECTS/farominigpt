import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini } from '@/lib/gemini';
import { parseAiJson } from '@/lib/parse-ai-json';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `
You are Faro, an AI assistant helping underrepresented entrepreneurs find grants and funding opportunities in U.S. cities.

Return ONLY valid JSON — no markdown, no code fences, no explanations.

Schema:
{
  "grants": Array<{
    "name": string,
    "amount": string,
    "deadline": string | null,
    "eligibility": string,
    "city": string | null,
    "industry": string | null,
    "link": string | null
  }>,
  "disclaimer": string
}

Rules:
- Return 3 to 8 relevant grants or funding programs.
- Be specific and accurate. If uncertain about a detail, set it to null rather than guessing.
- Always include a disclaimer that users should verify details directly with the grant provider.
`.trim();

type GrantsSearchPayload = {
  city?: string;
  industry?: string;
  stage?: string;
  keywords?: string;
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as GrantsSearchPayload;

    const message = JSON.stringify({
      city: body.city || null,
      industry: body.industry || null,
      stage: body.stage || null,
      keywords: body.keywords || null,
    }, null, 2);

    const text = await callGemini(message, {}, [], SYSTEM_INSTRUCTION);

    let json: unknown;
    try {
      json = parseAiJson(text);
    } catch {
      return NextResponse.json(
        { error: 'Grants response was not valid JSON.', raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to search grants', details: String(error) },
      { status: 500 },
    );
  }
}
