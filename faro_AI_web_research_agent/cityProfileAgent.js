/**
 * cityProfileAgent.js
 *
 * For each target city:
 *   1. Runs DuckDuckGo searches to find city-specific web pages per data category
 *   2. Fetches pre-defined authoritative sources (Census, Numbeo, city gov, state gov)
 *   3. Extracts ALL 29 data columns using strict AI prompts that demand real, city-specific data
 *   4. Falls back to AI training-knowledge if extracted data is generic/empty
 *   5. Skips cities already fully filled in the sheet; updates incomplete rows in place
 *
 * Usage:  node cityProfileAgent.js [target_cities.json]
 */

import { readFileSync }  from "fs";
import OpenAI            from "openai";
import dotenv            from "dotenv";
import { fileURLToPath } from "url";
import path              from "path";

import { fetchPageText }                                          from "./fetchPage.js";
import { appendCityProfileRow, getSheetRows, updateCityProfileRow } from "./googleSheets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config();

// ── AI client ─────────────────────────────────────────────────────────────────
const useHermes = process.env.USE_HERMES === "true";
const client = useHermes
  ? new OpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = useHermes
  ? (process.env.HERMES_MODEL || "hermes3:3b")
  : (process.env.OPENAI_MODEL  || "gpt-4o-mini");

// Smaller context budget for tiny local models
const MAX_TEXT  = useHermes ? 2500 : 7000;
const CONCURRENCY = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanJson(raw = "") {
  return raw
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "")
    .trim();
}

async function aiCall(prompt) {
  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    return JSON.parse(cleanJson(resp.choices[0].message.content));
  } catch {
    return null;
  }
}

async function safeFetch(url) {
  try { return (await fetchPageText(url)).text || ""; }
  catch { return ""; }
}

async function fetchMany(urls) {
  const texts = await Promise.all(urls.filter(Boolean).map(u => safeFetch(u)));
  return texts.filter(t => t.length > 80).join("\n\n---\n\n");
}

// ── DuckDuckGo search via plain HTTP (no browser needed) ─────────────────────

async function searchDDG(query, maxResults = 3) {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
      }
    );
    const html = await res.text();

    const urls = [];
    for (const m of html.matchAll(/uddg=([^"&\s]+)/g)) {
      const url = decodeURIComponent(m[1]);
      if (url.startsWith("http") && !url.includes("duckduckgo.com")) {
        urls.push(url);
        if (urls.length >= maxResults) break;
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// ── Score normalizer ──────────────────────────────────────────────────────────
// Ensures a score field is a valid integer string 1–100; defaults to 50.
function ensureScore(val) {
  const n = parseInt(String(val ?? ""));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? String(n) : "50";
}

const SCORE_FIELDS = [
  "cost_index", "housing_index_score", "opportunity_score",
  "network_strength", "business_score", "underrepresented_entrepreneurs_pct",
];

// ── Field descriptions used by the missing-field fallback ────────────────────
const FIELD_DESCRIPTIONS = {
  cost_of_living:                    "Cost-of-living index vs US average of 100. Include housing, grocery, utility, transport sub-indexes.",
  cost_index:                        "Integer 0–100 affordability score (100 = cheapest). Derive from cost-of-living vs US average.",
  housing_rent_estimates:            "Average monthly rent: studio, 1BR, 2BR in dollars. Include downtown vs suburb variation.",
  housing_index_score:               "Integer 0–100 housing affordability (100 = most affordable). Derive from rent-to-income ratio.",
  median_income:                     "Median household income and per capita income with Census year. Include poverty rate.",
  employment_indicators:             "Unemployment rate (cite BLS) and top 5 employers by name with approximate headcount.",
  industry_strengths:                "Top 5 industries with real named companies headquartered or with major presence.",
  business_environment:              "Specific tax advantages, enterprise zones, rankings, and programs that attract business owners.",
  minority_representation:           "Black/minority population % (Census) and minority-owned business %. Any notable rankings.",
  underrepresented_entrepreneurs_pct:"Integer 0–100 estimated % of underrepresented (minority, women, veteran) founders among all business owners.",
  opportunity_score:                 "Integer 0–100 overall entrepreneurial opportunity for underrepresented founders. Factor economic conditions, grants, policy, market size.",
  incubators_accelerators:           "2–4 real incubator or accelerator names operating in the city with brief descriptions.",
  coworking_spaces:                  "Real coworking spaces with specific names and neighborhoods.",
  startup_hubs:                      "Primary innovation district or tech hub: name, neighborhood, and what makes it notable.",
  mentorship_networks:               "SCORE chapter full name, local SBDC center name and location, and notable mentorship programs.",
  network_strength:                  "Integer 0–100 density and quality of mentors, accelerators, and support orgs for underrepresented entrepreneurs.",
  chambers_of_commerce:              "Full name and website of the primary Chamber of Commerce.",
  black_business_organizations:      "Names of Black-focused business organizations, minority chambers, and professional networks.",
  business_score:                    "Integer 0–100 business-friendliness for underrepresented entrepreneurs. Factor ecosystem, ease of starting, tax, support.",
  grant_name:                        "Full name of a real grant or funding program for entrepreneurs in the city or state.",
  funder:                            "Full legal name of the government agency, nonprofit, or foundation offering the grant.",
  eligibility_criteria:              "Specific requirements: business size, ownership type (minority/women/veteran), industry, revenue cap.",
  funding_amount:                    "Specific dollar range (e.g. '$5,000 to $50,000').",
  deadline:                          "Application deadline, cycle, or 'Rolling basis'.",
  application_link:                  "Direct URL to the grant application or program page.",
  geographic_scope:                  "Whether grant covers city, state, multi-state, or national.",
  target_audience:                   "Exactly who qualifies (e.g. minority-owned small businesses under 5 years, under $1M revenue).",
  tax_incentives:                    "Real tax credit programs with specific credit amounts or rates.",
  startup_support_programs:          "Real city and state programs supporting startups — names, what they provide, who runs them.",
  minority_business_certifications:  "Federal SBA 8(a), WOSB, HUBZone, SDVOSB plus state MBE/WBE/DBE programs with issuing agencies.",
  government_backed_initiatives:     "Opportunity Zone tracts, CDBG use, MBDA Business Center presence, notable city economic programs.",
  living_expenses:                   "Monthly cost breakdown: rent + groceries + transportation + utilities with specific dollar amounts.",
  business_setup_costs:              "LLC filing fee (exact $), registered agent ($/yr), local business license (approx $), key permits.",
  hiring_costs:                      "State minimum wage ($/hr), average hourly pay for admin/retail/tech roles, employer payroll tax rate.",
  utilities_and_infrastructure:      "Average monthly electricity, internet, water+gas costs. Key providers and internet quality.",
};

// ── Fill every empty field with a targeted AI knowledge call ─────────────────
async function fillMissingFields(city, state, profile) {
  const s = v => String(v ?? "").trim();

  const missing = Object.entries(FIELD_DESCRIPTIONS)
    .filter(([key]) => {
      const val = s(profile[key]);
      return !val || val === "0";
    });

  if (missing.length === 0) return;

  console.log(`  [${city}] Filling ${missing.length} empty field(s) with AI knowledge...`);

  const schema = Object.fromEntries(missing.map(([k, desc]) => [k, desc]));

  const filled = await aiCall(`
Using your training knowledge, provide a SPECIFIC, NON-EMPTY value for every field below for ${city}, ${state}, USA.

STRICT RULES — every single field MUST have a real, specific value:
- Use real names, real dollar amounts, real percentages — never leave a field blank.
- Never write "N/A", "contact local", "varies by", "see website", or any vague filler.
- For integer score fields (0–100): provide a reasonable estimate based on the city.
- For URL fields with no known link: use the most likely official URL (e.g. city/state gov site).

Return ONLY valid JSON with every key filled:
${JSON.stringify(schema, null, 2)}
`);

  if (!filled) return;

  for (const [key] of missing) {
    const val = s(filled[key]);
    if (val && val !== "0") profile[key] = val;
  }
}

// ── Generic-content detector ──────────────────────────────────────────────────
// Returns true when the extracted object contains too many vague/template phrases.

const GENERIC_PHRASES = [
  "contact local", "contact the city", "contact city", "see website",
  "visit website", "varies by", "check with", "multiple options",
  "various programs", "reach out to", "for more information",
  "contact funder", "contact real estate", "available upon request",
  "contact chamber", "contact sbdc",
];

function isGeneric(obj) {
  if (!obj || typeof obj !== "object") return true;
  const text = JSON.stringify(obj).toLowerCase();
  return GENERIC_PHRASES.filter(p => text.includes(p)).length >= 2;
}

// ── AI-knowledge fallback (no web text — uses model's own city knowledge) ─────

const FALLBACK_PROMPTS = {
  economic: (city, state) => `
Using your training knowledge, provide ACCURATE and SPECIFIC economic data for ${city}, ${state}, USA.
Every value must be specific to ${city} — real dollar amounts, real employer names, real percentages.
Scores must be integers 0–100.
Return ONLY valid JSON with exactly these keys:
{
  "cost_of_living": "",
  "cost_index": 0,
  "housing_rent_estimates": "",
  "housing_index_score": 0,
  "median_income": "",
  "employment_indicators": "",
  "industry_strengths": "",
  "business_environment": "",
  "minority_representation": "",
  "underrepresented_entrepreneurs_pct": 0,
  "opportunity_score": 0
}`,

  ecosystem: (city, state) => `
Using your training knowledge, name REAL organizations and places in ${city}, ${state}, USA.
Scores must be integers 0–100.
Return ONLY valid JSON with exactly these keys:
{
  "incubators_accelerators": "",
  "coworking_spaces": "",
  "startup_hubs": "",
  "mentorship_networks": "",
  "network_strength": 0,
  "chambers_of_commerce": "",
  "black_business_organizations": "",
  "business_score": 0
}`,

  grants: (city, state) => `
Using your training knowledge, name a REAL grant or funding program for entrepreneurs in ${city} or ${state}, USA.
Return ONLY valid JSON with exactly these keys:
{
  "grant_name": "",
  "funder": "",
  "eligibility_criteria": "",
  "funding_amount": "",
  "deadline": "",
  "application_link": "",
  "geographic_scope": "",
  "target_audience": ""
}`,

  policy: (city, state) => `
Using your training knowledge, name REAL policy incentives and government programs in ${state} and ${city}, USA.
Return ONLY valid JSON with exactly these keys:
{
  "tax_incentives": "",
  "startup_support_programs": "",
  "minority_business_certifications": "",
  "government_backed_initiatives": ""
}`,

  cost: (city, state) => `
Using your training knowledge, provide SPECIFIC cost data for ${city}, ${state}, USA with real dollar amounts.
Include actual ${state} LLC filing fee, actual ${state} minimum wage, real rent ranges, real utility costs.
Return ONLY valid JSON with exactly these keys:
{
  "living_expenses": "",
  "business_setup_costs": "",
  "hiring_costs": "",
  "utilities_and_infrastructure": ""
}`,
};

async function aiKnowledgeFallback(city, state, category) {
  return (await aiCall(FALLBACK_PROMPTS[category](city, state))) || {};
}

// ── Category extractors — strict prompts demand city-specific data ─────────────

async function extractEconomicData(city, state, text) {
  const data = await aiCall(`
You are extracting economic data EXCLUSIVELY for ${city}, ${state}, USA.

MANDATORY RULES — violations make the data useless:
1. Every field MUST be specific to ${city}. No generic descriptions.
2. Include REAL numbers: actual dollar amounts, real index scores, real percentages.
3. Name REAL employers, REAL industries present in ${city}.
4. Never write vague phrases like "contact agencies", "varies by area", "see website".
5. Use the web text below; where it lacks detail, use your knowledge of ${city}.

Return ONLY valid JSON — no markdown, no commentary.
All score fields must be integers 0–100:
{
  "cost_of_living": "Exact cost-of-living index for ${city} vs US average (100). Include housing, grocery, utility, and transport sub-indexes with numbers.",
  "cost_index": "Integer 0–100 scoring overall affordability for entrepreneurs (100 = most affordable). Derive from cost-of-living index relative to US average.",
  "housing_rent_estimates": "Average rent in ${city}: studio, 1BR, and 2BR in dollars per month. Include neighborhood variation (e.g. downtown vs suburbs).",
  "housing_index_score": "Integer 0–100 scoring housing affordability in ${city} (100 = most affordable). Derive from median rent vs median income ratio.",
  "median_income": "Median household income and per capita income for ${city} (cite Census year). Include poverty rate.",
  "employment_indicators": "Unemployment rate for ${city} metro area (cite BLS). Top 5 employers in ${city} by name with headcount.",
  "industry_strengths": "Top 5 industries in ${city}. Name real companies headquartered or with major presence there.",
  "business_environment": "Specific tax advantages, enterprise zones, rankings, and city/state programs that make ${city} attractive to business owners.",
  "minority_representation": "Black/minority percentage of ${city} population (Census). Percentage of minority-owned businesses. Any notable rankings.",
  "underrepresented_entrepreneurs_pct": "Integer 0–100 representing the estimated percentage of underrepresented (minority, women, veteran) entrepreneurs among all business owners in ${city}.",
  "opportunity_score": "Integer 0–100 scoring overall entrepreneurial opportunity in ${city} for underrepresented founders. Factor in economic conditions, grants access, policy support, and market size."
}

Web research text for ${city}, ${state}:
${text.slice(0, MAX_TEXT)}
`);

  if (!data || isGeneric(data)) return aiKnowledgeFallback(city, state, "economic");
  return data;
}

async function extractBusinessEcosystem(city, state, text) {
  const data = await aiCall(`
You are extracting business ecosystem data EXCLUSIVELY for ${city}, ${state}, USA.

MANDATORY RULES:
1. Name REAL organizations that actually operate in ${city}.
2. No placeholders — every entry must be a real, named entity in ${city}.
3. Use the text below; where it lacks specifics, use your knowledge of ${city}.

Return ONLY valid JSON. Score fields must be integers 0–100:
{
  "incubators_accelerators": "2–4 real incubator or accelerator program names operating in ${city} (e.g. Techstars, local university programs, city-backed programs) with a brief description of each.",
  "coworking_spaces": "Real coworking spaces in ${city} — name specific locations including any WeWork, Regus, or locally-owned spaces with their neighborhoods.",
  "startup_hubs": "Name of the primary innovation district or tech hub in ${city}, its location/neighborhood, and what makes it notable.",
  "mentorship_networks": "Full name of the SCORE chapter serving ${city}, the local SBDC center name and location, and any notable local mentorship programs.",
  "network_strength": "Integer 0–100 scoring the density and quality of mentors, accelerators, and support organizations available to underrepresented entrepreneurs in ${city}.",
  "chambers_of_commerce": "Full name and website of the primary Chamber of Commerce for ${city}.",
  "black_business_organizations": "Names of Black-focused business organizations, minority chambers, and professional networks active in ${city}.",
  "business_score": "Integer 0–100 scoring how business-friendly ${city} is for underrepresented entrepreneurs. Factor in ecosystem density, ease of starting a business, tax environment, and support programs."
}

Web research text for ${city}, ${state}:
${text.slice(0, MAX_TEXT)}
`);

  if (!data || isGeneric(data)) return aiKnowledgeFallback(city, state, "ecosystem");
  return data;
}

async function extractGrantsFunding(city, state, text) {
  const data = await aiCall(`
You are extracting grants and funding data for entrepreneurs in ${city}, ${state}, USA.

MANDATORY RULES:
1. Name a REAL grant or funding program that exists for ${city} or ${state}.
2. Funder must be a real, named organization — not "local agency" or "city office".
3. Dollar amounts must be specific (e.g. "$10,000–$75,000" not "up to various amounts").
4. Application link must be a real URL.
5. Use the text below; supplement with your knowledge of programs in ${city}/${state}.

Return ONLY valid JSON:
{
  "grant_name": "Full name of a real grant or funding program available in ${city} or ${state}",
  "funder": "Full legal name of the government agency, nonprofit, or foundation offering this grant",
  "eligibility_criteria": "Specific requirements: business size limit, ownership type required (minority/women/veteran-owned), industry restrictions, revenue cap, years in business",
  "funding_amount": "Specific dollar range this program provides (e.g. '$5,000 to $50,000')",
  "deadline": "Application deadline, cycle (e.g. 'Quarterly — check website'), or 'Rolling basis'",
  "application_link": "Direct URL to the grant application or program page",
  "geographic_scope": "Whether this grant covers ${city} specifically, ${state} statewide, multi-state region, or national",
  "target_audience": "Exactly who qualifies: e.g. minority-owned small businesses under 5 years old with under $1M revenue in ${state}"
}

Web research text for ${city}, ${state}:
${text.slice(0, MAX_TEXT)}
`);

  if (!data || isGeneric(data)) return aiKnowledgeFallback(city, state, "grants");
  return data;
}

async function extractPolicyIncentives(city, state, text) {
  const data = await aiCall(`
You are extracting policy incentives for businesses in ${city}, ${state}, USA.

MANDATORY RULES:
1. Name REAL programs and tax credits by their official names.
2. Include specific credit amounts, rates, or caps where known.
3. Name real certification bodies and real initiative programs.
4. Use the text below; supplement with your knowledge of ${state} and ${city} policy.

Return ONLY valid JSON:
{
  "tax_incentives": "Real tax credit or incentive programs in ${state} for businesses — name each program, the credit amount or rate, and what activity it rewards.",
  "startup_support_programs": "Real city and state programs supporting startups in ${city} — include program names, what they provide (loans, grants, training), and who runs them.",
  "minority_business_certifications": "Federal certifications (SBA 8(a), WOSB, HUBZone, SDVOSB, VOSB) plus ${state}-specific MBE/WBE/DBE programs — include the agency that issues each and how to apply.",
  "government_backed_initiatives": "Real federal and ${city} initiatives: Opportunity Zone tracts in ${city}, CDBG allocation use, MBDA Business Center presence, and any notable city-specific economic programs."
}

Web research text for ${city}, ${state}:
${text.slice(0, MAX_TEXT)}
`);

  if (!data || isGeneric(data)) return aiKnowledgeFallback(city, state, "policy");
  return data;
}

async function extractCostData(city, state, text) {
  const data = await aiCall(`
You are extracting cost and relocation data EXCLUSIVELY for ${city}, ${state}, USA.

MANDATORY RULES:
1. All costs must be specific dollar amounts for ${city} — no vague ranges.
2. Use actual ${state} LLC registration fee (exact dollar amount).
3. Include actual ${state} minimum wage (current hourly rate).
4. Use the text below; supplement with your knowledge of ${city}.

Return ONLY valid JSON:
{
  "living_expenses": "Monthly cost of living breakdown for ${city}: rent + groceries + transportation + utilities. Provide specific dollar amounts and a total monthly range.",
  "business_setup_costs": "Cost to start a business in ${state}: LLC filing fee (exact $), registered agent fee ($/yr), local business license for ${city} (approx $), plus any industry-specific permits.",
  "hiring_costs": "${state} minimum wage ($/hr), average hourly pay for key roles in ${city} (admin, retail, tech), and approximate employer payroll tax rate.",
  "utilities_and_infrastructure": "Average monthly utility costs in ${city}: electricity ($/mo), internet ($/mo), water+gas ($/mo). Note key providers and internet infrastructure quality."
}

Web research text for ${city}, ${state}:
${text.slice(0, MAX_TEXT)}
`);

  if (!data || isGeneric(data)) return aiKnowledgeFallback(city, state, "cost");
  return data;
}

// ── City research orchestrator ────────────────────────────────────────────────

async function researchCity(cityData) {
  const {
    city, state, censusSlug, govUrl, chamberUrl, ecosystemUrl,
    grantUrl, stateGovUrl, numbeoCity,
  } = cityData;

  const censusUrl = `https://www.census.gov/quickfacts/${censusSlug}`;
  const numbeoUrl = `https://www.numbeo.com/cost-of-living/in/${encodeURIComponent(numbeoCity || city)}`;

  console.log(`  [${city}] Searching DuckDuckGo for city-specific pages...`);

  // Targeted DDG searches — one per category that benefits most from live search
  const [ecosystemUrls, grantUrls, policyUrls] = await Promise.all([
    searchDDG(`"${city}" "${state}" incubators accelerators coworking spaces Black business organizations`, 3),
    searchDDG(`"${city}" OR "${state}" small business grants minority entrepreneurs funding 2024 2025`, 3),
    searchDDG(`"${state}" business tax credits incentives startup programs economic development`, 2),
  ]);

  console.log(`  [${city}] Fetching authoritative pages...`);

  // Each category gets its own relevant URL set
  const [econText, ecosystemText, grantText, policyText, costText] = await Promise.all([
    fetchMany([censusUrl, govUrl]),
    fetchMany([chamberUrl, ecosystemUrl, ...ecosystemUrls]),
    fetchMany([grantUrl, ...grantUrls, "https://www.sba.gov/funding-programs/grants", "https://mbda.gov/resources/grants"]),
    fetchMany([govUrl, stateGovUrl, ...policyUrls]),
    fetchMany([numbeoUrl, govUrl]),
  ]);

  console.log(`  [${city}] Extracting city-specific data...`);

  const [economic, ecosystem, grants, policy, cost] = await Promise.all([
    extractEconomicData(city, state, econText),
    extractBusinessEcosystem(city, state, ecosystemText),
    extractGrantsFunding(city, state, grantText),
    extractPolicyIncentives(city, state, policyText),
    extractCostData(city, state, costText),
  ]);

  const s = v => String(v || "").trim();

  const profile = {
    city,
    state,
    country: "United States",
    primarySourceUrl: govUrl || censusUrl,

    cost_of_living:                    s(economic.cost_of_living),
    cost_index:                        s(economic.cost_index),
    housing_rent_estimates:            s(economic.housing_rent_estimates),
    housing_index_score:               s(economic.housing_index_score),
    median_income:                     s(economic.median_income),
    employment_indicators:             s(economic.employment_indicators),
    industry_strengths:                s(economic.industry_strengths),
    business_environment:              s(economic.business_environment),
    minority_representation:           s(economic.minority_representation),
    underrepresented_entrepreneurs_pct: s(economic.underrepresented_entrepreneurs_pct),
    opportunity_score:                 s(economic.opportunity_score),

    incubators_accelerators:      s(ecosystem.incubators_accelerators),
    coworking_spaces:             s(ecosystem.coworking_spaces),
    startup_hubs:                 s(ecosystem.startup_hubs),
    mentorship_networks:          s(ecosystem.mentorship_networks),
    network_strength:             s(ecosystem.network_strength),
    chambers_of_commerce:         s(ecosystem.chambers_of_commerce),
    black_business_organizations: s(ecosystem.black_business_organizations),
    business_score:               s(ecosystem.business_score),

    grant_name:           s(grants.grant_name),
    funder:               s(grants.funder),
    eligibility_criteria: s(grants.eligibility_criteria),
    funding_amount:       s(grants.funding_amount),
    deadline:             s(grants.deadline),
    application_link:     s(grants.application_link),
    geographic_scope:     s(grants.geographic_scope),
    target_audience:      s(grants.target_audience),

    tax_incentives:                   s(policy.tax_incentives),
    startup_support_programs:         s(policy.startup_support_programs),
    minority_business_certifications: s(policy.minority_business_certifications),
    government_backed_initiatives:    s(policy.government_backed_initiatives),

    living_expenses:              s(cost.living_expenses),
    business_setup_costs:         s(cost.business_setup_costs),
    hiring_costs:                 s(cost.hiring_costs),
    utilities_and_infrastructure: s(cost.utilities_and_infrastructure),
  };

  // Guarantee no empty columns — fill any gaps with targeted AI knowledge
  await fillMissingFields(city, state, profile);

  // Ensure all score fields are valid integers 1–100
  for (const field of SCORE_FIELDS) {
    profile[field] = ensureScore(profile[field]);
  }

  return profile;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const citiesFile = process.argv[2] || "target_cities.json";
let cities;
try {
  cities = JSON.parse(readFileSync(citiesFile, "utf-8"));
} catch {
  console.error(`Cannot read ${citiesFile}. Run from the faro_AI_web_research_agent directory.`);
  process.exit(1);
}

console.log(`\nFaro City Profile Agent`);
console.log(`Model : ${MODEL}`);
console.log(`Cities: ${cities.length}`);

// ── Pre-load existing sheet rows ──────────────────────────────────────────────
console.log(`\nChecking Google Sheet for existing rows...`);
let existingMap = new Map();
try {
  const rows     = await getSheetRows();
  const complete = rows.filter(r => r.isComplete).length;
  console.log(`  ${rows.length} existing rows — ${complete} complete, ${rows.length - complete} incomplete`);
  for (const row of rows) existingMap.set(row.city.toLowerCase(), row);
} catch (err) {
  console.warn(`  Could not read sheet (${err.message}). Treating all cities as new.`);
}
console.log();

let written = 0, skipped = 0, failed = 0;

for (let i = 0; i < cities.length; i += CONCURRENCY) {
  const batch = cities.slice(i, i + CONCURRENCY);

  await Promise.all(batch.map(async (cityData, idx) => {
    const num      = i + idx + 1;
    const cityKey  = cityData.city.toLowerCase();
    const existing = existingMap.get(cityKey);

    // Already fully filled — skip
    if (existing?.isComplete) {
      console.log(`[${num}/${cities.length}] ✓ Skipped : ${cityData.city} — all columns filled`);
      skipped++;
      return;
    }

    try {
      const action = existing ? `↻ Updating row ${existing.rowNumber}` : "+ Adding new row";
      console.log(`[${num}/${cities.length}] ${action}: ${cityData.city}, ${cityData.state}`);

      const profile = await researchCity(cityData);

      if (existing) {
        await updateCityProfileRow(existing.rowNumber, profile);
      } else {
        await appendCityProfileRow(profile);
      }

      written++;
      console.log(`[${num}/${cities.length}] ✓ Done    : ${cityData.city}`);
    } catch (err) {
      failed++;
      console.error(`[${num}/${cities.length}] ✗ Failed  : ${cityData.city} — ${err.message}`);
    }
  }));
}

console.log(`\nDone — written/updated: ${written}, skipped (complete): ${skipped}, failed: ${failed}`);
process.exit(0);
