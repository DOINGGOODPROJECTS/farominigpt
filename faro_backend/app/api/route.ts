import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: 'Faro MiniGPT API',
    description: 'AI companion for underrepresented entrepreneurs',
    version: '1.0.0',
    endpoints: [
      '/api/recommend',
      '/api/compare-cities',
      '/api/grants',
      '/api/action-plan',
      '/api/chat',
      '/api/health',
    ],
    documentation: {
      openapi: 'https://minigpt.farosmart.com/openapi.yaml',
      plugin_manifest: 'https://minigpt.farosmart.com/.well-known/ai-plugin.json',
    },
  });
}
