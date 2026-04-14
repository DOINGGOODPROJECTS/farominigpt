import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { groupBy } from '@/lib/db-helpers';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const cities = await query<Record<string, unknown>>('SELECT * FROM `City`');
    const highlights = await query<Record<string, unknown>>('SELECT * FROM `CityHighlight`');
    const industries = await query<Record<string, unknown>>('SELECT * FROM `CityIndustry`');
    const incentives = await query<Record<string, unknown>>('SELECT * FROM `CityIncentive`');
    const grants = await query<Record<string, unknown>>('SELECT * FROM `Grant`');
    const favorites = await query<Record<string, unknown>>('SELECT * FROM `FavoriteCity`');
    const comparisonCities = await query<Record<string, unknown>>('SELECT * FROM `ComparisonCity`');

    const highlightsByCity = groupBy(highlights, (item) => item.cityId as number);
    const industriesByCity = groupBy(industries, (item) => item.cityId as number);
    const incentivesByCity = groupBy(incentives, (item) => item.cityId as number);
    const grantsByCity = groupBy(grants, (item) => item.cityId as number);
    const favoritesByCity = groupBy(favorites, (item) => item.cityId as number);
    const comparisonsByCity = groupBy(comparisonCities, (item) => item.cityId as number);

    const payload = cities.map((city) => ({
      ...city,
      highlights: highlightsByCity.get(city.id as number) ?? [],
      industries: industriesByCity.get(city.id as number) ?? [],
      incentives: incentivesByCity.get(city.id as number) ?? [],
      grants: grantsByCity.get(city.id as number) ?? [],
      favorites: favoritesByCity.get(city.id as number) ?? [],
      comparisonCities: comparisonsByCity.get(city.id as number) ?? [],
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cities', details: String(error) }, { status: 500 });
  }
}
