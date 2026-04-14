import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import {
  extractMakeAssistantText,
  extractMakeError,
  parseMakeWebhookResponse,
} from '@/lib/make-webhook';

export const runtime = 'nodejs';

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

const buildPrompt = (input: RecommendationRequest) => {
  const priorities = Array.isArray(input.priorities) ? input.priorities.filter(Boolean) : [];
  const shortlistCities = Array.isArray(input.shortlistCities)
    ? input.shortlistCities.filter(Boolean)
    : [];

  return `
You are Atlas, an AI decision engine that recommends U.S. cities for underrepresented entrepreneurs.

Return ONLY valid JSON matching this TypeScript type (no markdown, no explanations):
{
  "cities": Array<{ "name": string, "score": number, "why": string }>,
  "followUps"?: string[]
}

Rules:
- Provide 3 to 6 cities.
- "score" is 0-100 (integer).
- "why" is 1-2 sentences, actionable and specific.
- If key info is missing, include "followUps" with up to 5 short questions.

Input:
${JSON.stringify(
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
  )}
`.trim();
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as RecommendationRequest;

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Make webhook is not configured.' },
        { status: 503 },
      );
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MAKE_WEBHOOK_API_KEY
          ? { 'x-make-apikey': process.env.MAKE_WEBHOOK_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        message: buildPrompt(body),
        threadId: 'actions-recommendations',
        user: { id: 'actions', email: '', name: 'Actions' },
      }),
    });

    const raw = await webhookResponse.text();
    const parsed = parseMakeWebhookResponse(raw);

    if (!webhookResponse.ok) {
      return NextResponse.json(
        { error: extractMakeError(raw, parsed) || 'Unable to get AI response.' },
        { status: webhookResponse.status },
      );
    }

    const assistantText = extractMakeAssistantText(raw, parsed);
    if (!assistantText) {
      return NextResponse.json(
        { error: 'No response returned.' },
        { status: 502 },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(assistantText);
    } catch {
      return NextResponse.json(
        { error: 'Recommendation response was not valid JSON.', raw: assistantText },
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

