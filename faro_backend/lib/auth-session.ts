import { query } from '@/lib/db';

type SessionRow = {
  id: number;
  userId: number;
  token: string;
  expiresAt: Date;
};

export type AuthUser = {
  id: number;
};

const SESSION_COOKIE_NAME = 'adinkra_session';

const getCookieValue = (cookieHeader: string, name: string): string | null => {
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
};

export function getSessionToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const headerToken = request.headers.get('x-session-token');
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);

  return bearerToken || headerToken || cookieToken;
}

export async function requireAuth(request: Request): Promise<AuthUser | null> {
  const token = getSessionToken(request);

  if (!token) return null;

  const sessions = await query<SessionRow>(
    'SELECT id, userId, token, expiresAt FROM `Session` WHERE token = ?',
    [token],
  );
  const session = sessions[0];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  return { id: session.userId };
}
