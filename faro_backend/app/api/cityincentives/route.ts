import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { indexBy } from '@/lib/db-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const cityIncentives = await query<Record<string, unknown>>('SELECT * FROM `CityIncentive`');
    const cities = await query<Record<string, unknown>>('SELECT * FROM `City`');
    const cityById = indexBy(cities, (item) => item.id as number);

    const payload = cityIncentives.map((incentive) => ({
      ...incentive,
      city: cityById.get(incentive.cityId as number) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch city incentives', details: String(error) }, { status: 500 });
  }
}
