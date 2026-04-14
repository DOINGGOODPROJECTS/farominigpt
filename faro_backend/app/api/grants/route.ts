import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { indexBy } from '@/lib/db-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const grants = await query<Record<string, unknown>>('SELECT * FROM `Grant`');
    const cities = await query<Record<string, unknown>>('SELECT * FROM `City`');
    const cityById = indexBy(cities, (item) => item.id as number);

    const payload = grants.map((grant) => ({
      ...grant,
      city: cityById.get(grant.cityId as number) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch grants', details: String(error) }, { status: 500 });
  }
}
