import { NextResponse } from 'next/server';

const getAuthHeader = (request: Request) =>
  request.headers.get('authorization') || request.headers.get('Authorization');

const extractBearer = (header: string | null): string | null => {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
};

export const requireActionsApiKey = (request: Request) => {
  const configuredKey = process.env.FARO_ACTIONS_API_KEY?.trim();
  if (!configuredKey) {
    return NextResponse.json(
      { error: 'Actions API key is not configured.' },
      { status: 503 },
    );
  }

  const provided = extractBearer(getAuthHeader(request));
  if (!provided || provided !== configuredKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
};

