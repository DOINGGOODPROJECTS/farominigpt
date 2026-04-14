import { NextResponse } from "next/server";
import {
  extractMakeAssistantText,
  extractMakeError,
  parseMakeWebhookResponse,
} from "@/lib/make-webhook";

export const runtime = "nodejs";

type GuestChatPayload = {
  message?: string;
  guestId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GuestChatPayload;
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Guest chat is not configured." },
        { status: 500 },
      );
    }

    const threadId = body.guestId?.trim()
      ? `guest-${body.guestId.trim()}`
      : "guest-anon";

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MAKE_WEBHOOK_API_KEY
          ? { "x-make-apikey": process.env.MAKE_WEBHOOK_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        message,
        threadId,
        user: {
          id: threadId,
          email: "",
          name: "Guest",
        },
      }),
    });

    const raw = await webhookResponse.text();
    const parsed = parseMakeWebhookResponse(raw);

    if (!webhookResponse.ok) {
      return NextResponse.json(
        { error: extractMakeError(raw, parsed) || "Unable to get AI response." },
        { status: webhookResponse.status },
      );
    }

    const assistantText = extractMakeAssistantText(
      raw,
      parsed,
    ) || "Thanks for the context. How can I help next?";

    return NextResponse.json({ reply: assistantText });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to send guest chat message",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
