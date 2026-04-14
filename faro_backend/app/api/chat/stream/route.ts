import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { requireAuth } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';
import { allowRequest } from '@/lib/rate-limit';
import { extractMakeAssistantText, extractMakeError, parseMakeWebhookResponse } from '@/lib/make-webhook';

export const runtime = 'nodejs';

type Payload = { sessionId?: number; message?: string };

export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit per user
  if (!allowRequest(authUser.id, 1)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as Payload;
    const message = body.message?.trim();
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

    let sessionId = body.sessionId;
    if (sessionId) {
      const sessions = await query<{ id: number }>(
        'SELECT id FROM `ChatSession` WHERE id = ? AND userId = ?',
        [sessionId, authUser.id],
      );
      if (sessions.length === 0) return NextResponse.json({ error: 'Invalid session.' }, { status: 404 });
    } else {
      const title = message.replace(/\s+/g, ' ').trim().slice(0, 60);
      const result = await execute<ResultSetHeader>('INSERT INTO `ChatSession` (userId, title) VALUES (?, ?)', [authUser.id, title]);
      sessionId = result.insertId;
    }

    await execute<ResultSetHeader>('INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)', [sessionId, 'USER', message]);

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      const webhookUrl = process.env.MAKE_WEBHOOK_URL;
      if (!webhookUrl) {
        return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
      }

      const users = await query<{ id: number; email: string; name: string | null }>(
        'SELECT id, email, name FROM `User` WHERE id = ?',
        [authUser.id],
      );
      const user = users[0] || { id: authUser.id, email: '', name: null };

      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.MAKE_WEBHOOK_API_KEY
            ? { 'x-make-apikey': process.env.MAKE_WEBHOOK_API_KEY }
            : {}),
        },
        body: JSON.stringify({
          message,
          threadId: `user-${authUser.id}`,
          user,
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

      const reply = extractMakeAssistantText(raw, parsed) || 'Unable to get response.';

      await execute<ResultSetHeader>(
        'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)',
        [sessionId, 'ASSISTANT', reply],
      );
      await execute<ResultSetHeader>('UPDATE `ChatSession` SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);

      const encoder = new TextEncoder();
      const tokens = reply.replace(/\r?\n/g, ' ').match(/.{1,32}/g) || [];
      const stream = new ReadableStream({
        start(controller) {
          for (const token of tokens) {
            controller.enqueue(encoder.encode(`data: ${token}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    const systemPrompt = process.env.OPENAI_SYSTEM_PROMPT?.trim();

    const rows = await query<{ role: string; content: string }>('SELECT role, content FROM `ChatMessage` WHERE sessionId = ? ORDER BY createdAt ASC', [sessionId]);
    const messages = rows.map((r) => ({ role: r.role === 'ASSISTANT' ? 'assistant' : 'user', content: r.content }));
    const openAiMessages: { role: string; content: string }[] = [];
    if (systemPrompt) openAiMessages.push({ role: 'system', content: systemPrompt });
    openAiMessages.push(...messages);
    openAiMessages.push({ role: 'user', content: message });

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({ model, messages: openAiMessages, stream: true, max_tokens: 800 }),
    });

    if (!openAiRes.ok || !openAiRes.body) {
      const text = await openAiRes.text();
      return NextResponse.json({ error: `OpenAI error: ${openAiRes.status} ${text}` }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let assistantText = '';

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openAiRes.body!.getReader();
        let done = false;
        let buffer = '';
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() || '';
            for (const part of parts) {
              const line = part.trim();
              if (!line) continue;
              // OpenAI stream lines start with 'data: '
              const content = line.startsWith('data:') ? line.slice(5).trim() : line;
              if (content === '[DONE]') {
                // signal done
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                done = true;
                break;
              }
              try {
                const json = JSON.parse(content);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  assistantText += delta;
                  // forward as SSE data event with raw token
                  controller.enqueue(encoder.encode(`data: ${delta}\n\n`));
                }
              } catch (e) {
                // ignore parse errors
              }
            }
          }
          if (doneReading) break;
        }

        // final DB persist of assistant text
        try {
          if (assistantText.trim()) {
            await execute<ResultSetHeader>('INSERT INTO `ChatMessage` (sessionId, role, content) VALUES (?, ?, ?)', [sessionId, 'ASSISTANT', assistantText]);
            await execute<ResultSetHeader>('UPDATE `ChatSession` SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);
          }
        } catch (e) {
          // persistence error - not fatal for stream
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to start chat stream', details: String(error) }, { status: 500 });
  }
}
