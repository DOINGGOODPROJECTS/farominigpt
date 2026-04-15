import { NextResponse } from 'next/server';
import { requireActionsApiKey } from '@/lib/actions-auth';
import { callGemini, type ConversationTurn } from '@/lib/gemini';

export const runtime = 'nodejs';

type ChatPayload = {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export async function POST(request: Request) {
  const authError = requireActionsApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ChatPayload;
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }

    const history: ConversationTurn[] = (body.history ?? []).map((h) => ({
      role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: h.content,
    }));

    const reply = await callGemini(message, {}, history);

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get response', details: String(error) },
      { status: 500 },
    );
  }
}
