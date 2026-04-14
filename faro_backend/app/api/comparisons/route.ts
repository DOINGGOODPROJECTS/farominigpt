import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { groupBy, indexBy } from '@/lib/db-helpers';
import { requireAuth } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const comparisons = await query<Record<string, unknown>>('SELECT * FROM `Comparison`');
    const users = await query<Record<string, unknown>>('SELECT * FROM `User`');
    const comparisonCities = await query<Record<string, unknown>>('SELECT * FROM `ComparisonCity`');

    const userById = indexBy(users, (item) => item.id as number);
    const citiesByComparison = groupBy(comparisonCities, (item) => item.comparisonId as number);

    const payload = comparisons.map((comparison) => ({
      ...comparison,
      user: userById.get(comparison.userId as number) ?? null,
      cities: citiesByComparison.get(comparison.id as number) ?? [],
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch comparisons', details: String(error) }, { status: 500 });
  }
}