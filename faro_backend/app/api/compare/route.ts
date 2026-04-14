import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import {
  extractMakeAssistantText,
  extractMakeError,
  parseMakeWebhookResponse,
} from '@/lib/make-webhook';

export const runtime = 'nodejs';

type CompareResponse = {
  city1: string;
  city2: string;
  summary: string;
  verdict: string;
  scores: { city1: number; city2: number };
  pros: { city1: string[]; city2: string[] };
  cons: { city1: string[]; city2: string[] };
  nextSteps?: string[];
};

const buildPrompt = (city1: string, city2: string, context: Record<string, unknown>) => `
You are Atlas, an AI decision engine that compares U.S. cities for underrepresented entrepreneurs.

Return ONLY valid JSON matching:
{
  "city1": string,
  "city2": string,
  "summary": string,
  "verdict": string,
  "scores": { "city1": number, "city2": number },
  "pros": { "city1": string[], "city2": string[] },
  "cons": { "city1": string[], "city2": string[] },
  "nextSteps"?: string[]
}

Rules:
- Scores are 0-100 (integers).
- Pros/cons arrays: 3-6 bullets each.
- Keep summary and verdict concise.

Cities:
- city1: ${city1}
- city2: ${city2}

Context:
${JSON.stringify(context, null, 2)}
`.trim();

export async function GET(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const city1 = (url.searchParams.get('city1') || '').trim();
    const city2 = (url.searchParams.get('city2') || '').trim();
    if (!city1 || !city2) {
      return NextResponse.json(
        { error: 'city1 and city2 are required.' },
        { status: 400 },
      );
    }

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Make webhook is not configured.' },
        { status: 503 },
      );
    }

    const context: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key === 'city1' || key === 'city2') continue;
      context[key] = value;
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
        message: buildPrompt(city1, city2, context),
        threadId: 'actions-compare',
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
        { error: 'Comparison response was not valid JSON.', raw: assistantText },
        { status: 502 },
      );
    }

    return NextResponse.json(json as CompareResponse);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to compare cities', details: String(error) },
      { status: 500 },
    );
  }
}

