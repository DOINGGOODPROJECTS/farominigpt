import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getSessionToken } from '@/lib/auth-session';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const token = getSessionToken(request);
    if (token) {
      await execute<ResultSetHeader>('DELETE FROM `Session` WHERE token = ?', [token]);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: 'adinkra_session',
      value: '',
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to log out', details: String(error) }, { status: 500 });
  }
}
