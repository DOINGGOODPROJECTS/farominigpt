import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_INSTRUCTION = `
You are Faro, an AI companion that helps underrepresented entrepreneurs discover the best places to start and grow their businesses.
Your job is to recommend cities, compare markets, surface grants, and guide relocation strategy.
Use the user's profile (industry, stage, budget, relocation window, priorities) when answering.
Keep responses concise, practical, and action-oriented.
When the user asks to compare cities, provide a short comparison and a clear recommendation.
If the user requests data you do not have, ask a brief clarifying question.
Never invent grants or facts; instead, say you can check the latest data or ask which city or industry to focus on.

Output format rules:
- Return ONLY plain text.
- Do NOT return JSON, code blocks, or markdown fences.
- You may use markdown tables when comparing multiple cities side by side.
`.trim();

export type UserProfile = {
  industry?: string | null;
  stage?: string | null;
  budgetRange?: string | null;
  relocationWindow?: string | null;
  priorities?: string | null;
  currentLocation?: string | null;
};

export type ConversationTurn = {
  role: 'user' | 'model';
  text: string;
};

function buildSystemInstruction(profile: UserProfile): string {
  const parts: string[] = [SYSTEM_INSTRUCTION];

  const hasProfile =
    profile.industry ||
    profile.stage ||
    profile.budgetRange ||
    profile.relocationWindow ||
    profile.priorities ||
    profile.currentLocation;

  if (hasProfile) {
    const profileLines = [
      `- Industry: ${profile.industry || 'Not provided'}`,
      `- Stage: ${profile.stage || 'Not provided'}`,
      `- Budget: ${profile.budgetRange || 'Not provided'}`,
      `- Relocation window: ${profile.relocationWindow || 'Not provided'}`,
      `- Priorities: ${profile.priorities || 'Not provided'}`,
      `- Current location: ${profile.currentLocation || 'Not provided'}`,
    ];
    parts.push(`\nUser profile:\n${profileLines.join('\n')}`);
  }

  return parts.join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
}

let _gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
    _gemini = new GoogleGenAI({ apiKey });
  }
  return _gemini;
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      throw new Error('OPENAI_API_KEY is not configured.');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      throw new Error('ANTHROPIC_API_KEY is not configured.');
    }
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENAI_FALLBACK_MODEL = 'gpt-4.1-nano';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const GEMINI_TIMEOUT_MS = 20000;
const OPENAI_TIMEOUT_MS = 12000;
const CLAUDE_TIMEOUT_MS = 15000;

function isTransient(error: unknown): boolean {
  const msg = String(error);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('Timeout')
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callOpenAIFallback(
  message: string,
  profile: UserProfile,
  history: ConversationTurn[],
  systemInstruction?: string,
): Promise<string> {
  const openai = getOpenAI();
  const resolvedInstruction = systemInstruction ?? buildSystemInstruction(profile);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: resolvedInstruction },
    ...history.map((turn) => ({
      role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: turn.text,
    })),
    { role: 'user', content: message },
  ];

  const response = await openai.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    messages,
    temperature: 0.4,
  });

  return (response.choices[0]?.message?.content ?? '').trim();
}

async function callClaude(
  message: string,
  profile: UserProfile,
  history: ConversationTurn[],
  systemInstruction?: string,
): Promise<string> {
  const client = getAnthropic();
  const system = systemInstruction ?? buildSystemInstruction(profile);

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({
      role: t.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: t.text,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages,
  });

  const reply = response.content.find((b) => b.type === 'text')?.text ?? '';
  if (!reply) throw new Error('Empty Claude response.');
  return reply.trim();
}

export async function callGemini(
  message: string,
  profile: UserProfile = {},
  history: ConversationTurn[] = [],
  systemInstruction?: string,
): Promise<string> {
  const ai = getGemini();

  const contents = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  const config = {
    systemInstruction: systemInstruction ?? buildSystemInstruction(profile),
    temperature: 0.4,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model: GEMINI_MODEL, contents, config }),
        GEMINI_TIMEOUT_MS,
      );
      return (response.text ?? '').trim();
    } catch (error) {
      if (!isTransient(error)) break;
      if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS);
    }
  }

  console.warn('[faro] Gemini failed → trying GPT-4.1-nano');
  try {
    return await withTimeout(
      callOpenAIFallback(message, profile, history, systemInstruction),
      OPENAI_TIMEOUT_MS,
    );
  } catch (openaiError) {
    console.warn('[faro] GPT-4.1-nano failed → trying Claude agent', String(openaiError));
  }

  try {
    return await withTimeout(
      callClaude(message, profile, history, systemInstruction),
      CLAUDE_TIMEOUT_MS,
    );
  } catch (claudeError) {
    console.error('[faro] All AI providers failed', String(claudeError));
    throw new Error('The AI service is temporarily unavailable. Please try again in a moment.');
  }
}
