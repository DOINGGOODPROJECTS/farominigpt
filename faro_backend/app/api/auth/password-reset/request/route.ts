import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type ResetRequestPayload = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResetRequestPayload;
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const users = await query<{ id: number }>(
      'SELECT id FROM `User` WHERE email = ?',
      [email],
    );
    const user = users[0];

    if (!user) {
      return NextResponse.json(
        { error: 'No account found for that email address.' },
        { status: 404 },
      );
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await execute<ResultSetHeader>(
      'INSERT INTO `PasswordResetToken` (userId, tokenHash, expiresAt) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt],
    );

    const resetUrlBase =
      process.env.PASSWORD_RESET_URL || 'http://localhost:5000/reset-password';
    const resetUrl = `${resetUrlBase}?token=${token}`;

    let mailResult: { messageId?: string; response?: string } | null = null;
    let mailErrorMessage: string | null = null;
    try {
      mailResult = await sendMail({
        to: email,
        subject: 'Reset your Atlas password',
        text: `Use this link to reset your password: ${resetUrl}`,
        html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    } catch (mailError) {
      mailErrorMessage =
        mailError instanceof Error ? mailError.message : String(mailError);
      console.error('Password reset email failed:', mailError);
    }

    if (mailErrorMessage) {
      return NextResponse.json(
        {
          error: 'Unable to send reset email.',
          details:
            process.env.NODE_ENV !== 'production' ? mailErrorMessage : undefined,
        },
        { status: 500 },
      );
    }

    const response: Record<string, unknown> = { ok: true };
    if (process.env.NODE_ENV !== 'production') {
      response.resetToken = token;
      response.resetUrl = resetUrl;
      response.expiresAt = expiresAt;
      response.mail = mailResult;
    }
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to request password reset', details: String(error) }, { status: 500 });
  }
}
