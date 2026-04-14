import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

type IncentiveRow = {
  cityId: string;
  name: string;
  stateCode: string;
  incentives: string[];
};

const DATA_PATH = path.join(process.cwd(), 'data', 'Incentives.csv');

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, '').trim());
};

const normalizeValue = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const loadIncentiveRows = async (): Promise<IncentiveRow[]> => {
  const content = await readFile(DATA_PATH, 'utf8');
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headerIndex = lines.findIndex((line) =>
    line.toLowerCase().includes('city'),
  );
  if (headerIndex === -1) {
    return [];
  }
  const dataLines = lines.slice(headerIndex + 1);
  const rows: IncentiveRow[] = [];
  for (const line of dataLines) {
    const cells = parseCsvLine(line);
    if (cells.length < 2) continue;
    const cityId = cells[0];
    const cityRaw = cells[1];
    const [namePart, statePart] = cityRaw.split(',').map((part) => part.trim());
    const incentives = cells
      .slice(2)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    rows.push({
      cityId,
      name: namePart,
      stateCode: statePart || '',
      incentives,
    });
  }
  return rows;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city');
  const country = searchParams.get('country');
  const state = searchParams.get('state');
  if (!city) {
    return NextResponse.json({ error: 'City parameter is required' }, { status: 400 });
  }

  try {
    const rows = await loadIncentiveRows();
    const normalizedCity = normalizeValue(city);
    const normalizedState = state ? normalizeValue(state) : '';
    const normalizedCountry = country ? normalizeValue(country) : '';

    const nameMatches = rows.filter((row) => {
      const normalizedRowName = normalizeValue(row.name);
      if (normalizedRowName === normalizedCity) return true;
      const cityIdName = row.cityId.split('_')[0].replace(/-/g, ' ');
      return normalizeValue(cityIdName) === normalizedCity;
    });

    let matches = nameMatches;
    if (normalizedState) {
      matches = nameMatches.filter(
        (row) => normalizeValue(row.stateCode) === normalizedState,
      );
    } else if (normalizedCountry) {
      matches = nameMatches.filter(
        (row) => normalizeValue(row.stateCode) === normalizedCountry,
      );
    }

    const match = matches[0] || nameMatches[0];
    if (!match) {
      return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    return NextResponse.json({
      incentives: match.incentives,
      city: match.name,
      state: match.stateCode,
      cityId: match.cityId,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
