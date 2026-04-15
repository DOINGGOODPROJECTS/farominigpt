import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";

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

    const reply = await callGemini(message);

    return NextResponse.json({ reply });
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
