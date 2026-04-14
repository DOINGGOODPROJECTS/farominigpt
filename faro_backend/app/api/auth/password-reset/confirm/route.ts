import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { hashPassword, hashToken } from '@/lib/auth';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type ResetConfirmPayload = {
  token?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResetConfirmPayload;
    const token = body.token?.trim();
    const password = body.password;

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const tokens = await query<{ id: number; userId: number; expiresAt: Date; usedAt: Date | null }>(
      'SELECT id, userId, expiresAt, usedAt FROM `PasswordResetToken` WHERE tokenHash = ?',
      [tokenHash],
    );
    const tokenRow = tokens[0];
    if (!tokenRow || tokenRow.usedAt || new Date(tokenRow.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await execute<ResultSetHeader>('UPDATE `User` SET password = ? WHERE id = ?', [
      passwordHash,
      tokenRow.userId,
    ]);
    await execute<ResultSetHeader>('UPDATE `PasswordResetToken` SET usedAt = ? WHERE id = ?', [
      new Date(),
      tokenRow.id,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset password', details: String(error) }, { status: 500 });
  }
}
