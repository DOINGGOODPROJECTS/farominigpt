import 'dotenv/config';
import mysql from 'mysql2/promise';
import type { ResultSetHeader } from 'mysql2';
import { hashPassword } from './lib/auth';

const databaseUrl = process.env.DATABASE_URL;

const pool = mysql.createPool(
  databaseUrl
    ? { uri: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      },
);

const tables = [
  'ChatMessage',
  'ChatSession',
  'ComparisonCity',
  'Comparison',
  'FavoriteCity',
  'SavedSearch',
  'Report',
  'Notification',
  'Session',
  'UserProfile',
  'Grant',
  'CityIncentive',
  'CityIndustry',
  'CityHighlight',
  'City',
  'User',
];

async function main() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    type CityIncentiveSeed = {
      title: string;
      description?: string;
      url?: string;
    };
    type CityGrantSeed = {
      name: string;
      deadline?: Date;
      amount?: string;
      url?: string;
    };
    type CitySeed = {
      slug: string;
      name: string;
      state: string;
      region: 'NORTHEAST' | 'SOUTH' | 'MIDWEST' | 'WEST';
      population?: number;
      medianIncome?: number;
      costIndex?: number;
      businessScore?: number;
      blackPopulationPct?: number;
      opportunityScore?: number;
      networkStrength?: number;
      housingIndex?: number;
      climate?: string;
      highlights: string[];
      industries: string[];
      incentives: CityIncentiveSeed[];
      grants: CityGrantSeed[];
    };

    const cities: CitySeed[] = [
      {
        slug: 'atlanta-ga',
        name: 'Atlanta',
        state: 'GA',
        region: 'SOUTH',
        population: 498000,
        medianIncome: 71000,
        costIndex: 98,
        businessScore: 86,
        blackPopulationPct: 47,
        opportunityScore: 88,
        networkStrength: 90,
        housingIndex: 95,
        climate: 'Humid subtropical',
        highlights: [
          'Global fintech & logistics hub',
          'Top underrepresented entrepreneur network',
          'Strong airport connectivity',
        ],
        industries: ['Fintech', 'Logistics', 'Media'],
        incentives: [
          {
            title: 'Invest Atlanta Grants',
            description: 'Local grants and mentorship for growth-stage founders.',
            url: 'https://investatlanta.com',
          },
        ],
        grants: [{ name: 'ATL Business Boost', deadline: new Date('2026-10-18'), amount: '$25K' }],
      },
      {
        slug: 'houston-tx',
        name: 'Houston',
        state: 'TX',
        region: 'SOUTH',
        population: 2300000,
        medianIncome: 61000,
        costIndex: 92,
        businessScore: 82,
        blackPopulationPct: 23,
        opportunityScore: 84,
        networkStrength: 78,
        housingIndex: 88,
        climate: 'Hot humid',
        highlights: ['Energy + medical corridor', 'No state income tax', 'Large port economy'],
        industries: ['Energy', 'Health', 'Aerospace'],
        incentives: [
          {
            title: 'Houston Small Business Grants',
            description: 'City-backed funding for minority founders.',
            url: 'https://houstontx.gov',
          },
        ],
        grants: [{ name: 'Houston Forge', deadline: new Date('2026-09-30'), amount: '$30K' }],
      },
      {
        slug: 'detroit-mi',
        name: 'Detroit',
        state: 'MI',
        region: 'MIDWEST',
        population: 630000,
        medianIncome: 40000,
        costIndex: 84,
        businessScore: 72,
        blackPopulationPct: 77,
        opportunityScore: 78,
        networkStrength: 82,
        housingIndex: 68,
        climate: 'Cold winters',
        highlights: [
          'Manufacturing resurgence',
          'Affordable industrial space',
          'Major foundation support',
        ],
        industries: ['Mobility', 'Manufacturing', 'Design'],
        incentives: [
          {
            title: 'Motor City Match',
            description: 'Small business funding and coaching program.',
            url: 'https://motorcitymatch.com',
          },
        ],
        grants: [{ name: 'Motor City Match', deadline: new Date('2026-10-05'), amount: '$50K' }],
      },
    ];

    const cityIds: number[] = [];
    for (const city of cities) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO \`City\` (
          slug, name, state, region, population, medianIncome, costIndex, businessScore,
          blackPopulationPct, opportunityScore, networkStrength, housingIndex, climate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          city.slug,
          city.name,
          city.state,
          city.region,
          city.population,
          city.medianIncome,
          city.costIndex,
          city.businessScore,
          city.blackPopulationPct,
          city.opportunityScore,
          city.networkStrength,
          city.housingIndex,
          city.climate,
        ],
      );
      const cityId = result.insertId;
      cityIds.push(cityId);

      const highlightValues = city.highlights.map((text, index) => [cityId, text, index]);
      await connection.query(
        'INSERT INTO `CityHighlight` (cityId, text, `order`) VALUES ?',
        [highlightValues],
      );

      const industryValues = city.industries.map((name) => [cityId, name]);
      await connection.query('INSERT INTO `CityIndustry` (cityId, name) VALUES ?', [industryValues]);

      const incentiveValues = city.incentives.map((incentive) => [
        cityId,
        incentive.title,
        incentive.description ?? null,
        incentive.url ?? null,
      ]);
      await connection.query(
        'INSERT INTO `CityIncentive` (cityId, title, description, url) VALUES ?',
        [incentiveValues],
      );

      const grantValues = city.grants.map((grant) => [
        cityId,
        grant.name,
        grant.deadline ?? null,
        grant.amount ?? null,
        grant.url ?? null,
      ]);
      await connection.query(
        'INSERT INTO `Grant` (cityId, name, deadline, amount, url) VALUES ?',
        [grantValues],
      );
    }

    const [atlantaId, houstonId] = cityIds;

    const passwordHash = await hashPassword('hashed-password');
    const [userResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO `User` (email, name, password) VALUES (?, ?, ?)',
      ['founder@adinkraatlas.com', 'Janelle Parker', passwordHash],
    );
    const userId = userResult.insertId;

    await connection.query(
      `INSERT INTO \`UserProfile\` (
        userId, businessName, stage, industry, relocationWindow, budgetRange, priorities,
        currentLocation, relocationNotes, responseStyle
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'Atlas Studio',
        'EARLY_REVENUE',
        'Fintech',
        '3-6 months',
        '$50k-$150k',
        JSON.stringify(['Cost', 'Network', 'Grants']),
        'New York, NY',
        'Seeking a strong underrepresented founder ecosystem and funding.',
        'Concise',
      ],
    );

    await connection.query(
      'INSERT INTO `SavedSearch` (userId, query, region, sortKey, filters) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Affordable fintech hubs', 'SOUTH', 'opportunityScore', JSON.stringify({ maxCostIndex: 105 })],
    );

    await connection.query('INSERT INTO `FavoriteCity` (userId, cityId) VALUES (?, ?)', [
      userId,
      atlantaId,
    ]);

    const [comparisonResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO `Comparison` (userId, title) VALUES (?, ?)',
      [userId, 'South expansion shortlist'],
    );
    const comparisonId = comparisonResult.insertId;

    await connection.query(
      'INSERT INTO `ComparisonCity` (comparisonId, cityId, orderIndex) VALUES ?',
      [[[comparisonId, atlantaId, 0], [comparisonId, houstonId, 1]]],
    );

    const [chatSessionResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO `ChatSession` (userId, title) VALUES (?, ?)',
      [userId, 'Funding options'],
    );
    const chatSessionId = chatSessionResult.insertId;

    await connection.query(
      'INSERT INTO `ChatMessage` (sessionId, role, content) VALUES ?',
      [
        [
          [chatSessionId, 'USER', 'Compare grants for Atlanta and Houston.'],
          [
            chatSessionId,
            'ASSISTANT',
            'Atlanta shows stronger local grant programs, while Houston offers tax benefits.',
          ],
        ],
      ],
    );

    await connection.query(
      'INSERT INTO `Notification` (userId, title, category) VALUES ?',
      [
        [
          [userId, 'New grant match: ATL Business Boost', 'GRANTS'],
          [userId, 'Atlanta cost index updated', 'CITY_DATA'],
        ],
      ],
    );

    await connection.query(
      'INSERT INTO `Report` (userId, type, status, url, payload) VALUES (?, ?, ?, ?, ?)',
      [
        userId,
        'COMPARISON',
        'READY',
        'https://cdn.adinkraatlas.com/reports/atlanta-vs-houston.pdf',
        JSON.stringify({ cities: ['Atlanta', 'Houston'], score: 87 }),
      ],
    );

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    await connection.query(
      'INSERT INTO `Session` (userId, token, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?)',
      [userId, 'session-token-001', '127.0.0.1', 'seed-script', expiresAt],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
