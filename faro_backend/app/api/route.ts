import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    message: 'Atlas Backend API Root',
    endpoints: [
      '/api/cities',
      '/api/users',
      '/api/grants',
      '/api/chatsessions',
      '/api/reports',
      '/api/notifications',
      '/api/chat/sessions',
      '/api/chat/messages',
      '/api/sessions',
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/password-reset/request',
      '/api/auth/password-reset/confirm',
      '/api/comparisons',
      '/api/savedsearches',
      '/api/userprofiles',
      '/api/cityhighlights',
      '/api/cityincentives',
      '/api/cityindustries',
      '/api/all-data'
    ]
  });
}
