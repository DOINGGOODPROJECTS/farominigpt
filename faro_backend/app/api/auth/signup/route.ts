import { NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';
import { generateToken, hashPassword } from '@/lib/auth';
import type { ResultSetHeader } from 'mysql2/promise';

export const runtime = 'nodejs';

type SignupPayload = {
  email?: string;
  password?: string;
  name?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const name = body.name?.trim() || null;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const existing = await query<{ id: number }>('SELECT id FROM `User` WHERE email = ?', [email]);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already exists.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const userResult = await execute<ResultSetHeader>(
      'INSERT INTO `User` (email, name, password) VALUES (?, ?, ?)',
      [email, name, passwordHash],
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await execute<ResultSetHeader>(
      'INSERT INTO `Session` (userId, token, expiresAt) VALUES (?, ?, ?)',
      [userResult.insertId, token, expiresAt],
    );

    const response = NextResponse.json({
      user: { id: userResult.insertId, email, name },
      expiresAt,
    });
    response.cookies.set({
      name: 'adinkra_session',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to sign up', details: String(error) }, { status: 500 });
  }
}
