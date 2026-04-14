import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { generateToken, verifyPassword } from '@/lib/auth';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const users = await query<{ id: number; email: string; name: string | null; password: string }>(
      'SELECT id, email, name, password FROM `User` WHERE email = ?',
      [email],
    );
    const user = users[0];
    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await execute<ResultSetHeader>(
      'INSERT INTO `Session` (userId, token, expiresAt) VALUES (?, ?, ?)',
      [user.id, token, expiresAt],
    );

    const response = NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      expiresAt,
    });
    response.cookies.set({
      name: 'adinkra_session',
      value: token,
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to log in', details: String(error) }, { status: 500 });
  }
}
