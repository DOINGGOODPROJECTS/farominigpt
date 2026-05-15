import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAuthClient } from "./googleAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env.local");

const SHEET_TITLE = "FARO_DATASET";
const ALL_TECH_FOLDER_ID = process.env.GOOGLE_FOLDER_ID || "1AygChtmflL2X4P-_Q_WjG2Kil8braHif";

// ── Column definitions in order (must match Excel layout)
const GROUP_ROW = [
  // CORE (17 cols)
  "CORE", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  // CITY ECONOMIC DATA (11 cols)
  "CITY ECONOMIC DATA", "", "", "", "", "", "", "", "", "", "",
  // BUSINESS ECOSYSTEM (8 cols)
  "BUSINESS ECOSYSTEM", "", "", "", "", "", "", "",
  // GRANTS & FUNDING (8 cols)
  "GRANTS & FUNDING", "", "", "", "", "", "", "",
  // POLICY INCENTIVES (4 cols)
  "POLICY INCENTIVES", "", "", "",
  // COST & RELOCATION DATA (4 cols)
  "COST & RELOCATION DATA", "", "", "",
];

const HEADER_ROW = [
  // CORE
  "ID", "Category", "Title", "Location", "City", "State", "Country",
  "Description", "Source URL", "Source Name", "Confidence Score",
  "Confidence Level", "Status", "Date Fetched", "Last Verified",
  "Created At", "Updated At",
  // CITY ECONOMIC DATA
  "Cost of Living", "Cost Index (0-100)", "Housing & Rent Estimates",
  "Housing Index Score (0-100)", "Median Income",
  "Employment Indicators", "Industry Strengths", "Business Environment",
  "Minority Representation (%)", "Underrepresented Entrepreneurs (%)",
  "Opportunity Score (0-100)",
  // BUSINESS ECOSYSTEM
  "Incubators & Accelerators", "Coworking Spaces", "Startup Hubs",
  "Mentorship Networks", "Network Strength (0-100)",
  "Chambers of Commerce", "Black Business Organizations",
  "Business Score (0-100)",
  // GRANTS & FUNDING
  "Grant Name", "Funder", "Eligibility Criteria", "Funding Amount",
  "Deadline", "Application Link", "Geographic Scope", "Target Audience",
  // POLICY INCENTIVES
  "Tax Incentives", "Startup Support Programs",
  "Minority Business Certifications", "Government-Backed Initiatives",
  // COST & RELOCATION DATA
  "Living Expenses", "Business Setup Costs", "Hiring Costs",
  "Utilities & Infrastructure",
];

function stringify(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function flattenData(data = {}) {
  const d = data;
  const minority =
    stringify(d.minority_representation) ||
    stringify(d.demographics?.minority_representation);

  return [
    // city_economic_data (11 cols)
    stringify(d.cost_of_living),
    stringify(d.cost_index),
    stringify(d.housing_rent_estimates),
    stringify(d.housing_index_score),
    stringify(d.median_income),
    stringify(d.employment_indicators),
    stringify(d.industry_strengths),
    stringify(d.business_environment),
    minority,
    stringify(d.underrepresented_entrepreneurs_pct),
    stringify(d.opportunity_score),
    // business_ecosystem (8 cols)
    stringify(d.incubators_accelerators),
    stringify(d.coworking_spaces),
    stringify(d.startup_hubs),
    stringify(d.mentorship_networks),
    stringify(d.network_strength),
    stringify(d.chambers_of_commerce),
    stringify(d.black_business_organizations),
    stringify(d.business_score),
    // grants_funding
    stringify(d.grant_name),
    stringify(d.funder),
    stringify(d.eligibility_criteria),
    stringify(d.funding_amount),
    stringify(d.deadline),
    stringify(d.application_link),
    stringify(d.geographic_scope),
    stringify(d.target_audience),
    // policy_incentives
    stringify(d.tax_incentives),
    stringify(d.startup_support_programs),
    stringify(d.minority_business_certifications),
    stringify(d.government_backed_initiatives),
    // cost_relocation_data
    stringify(d.living_expenses),
    stringify(d.business_setup_costs),
    stringify(d.hiring_costs),
    stringify(d.utilities_and_infrastructure),
  ];
}

function saveSheetId(sheetId) {
  let envContent = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8")
    : "";
  if (/^GOOGLE_SHEET_ID=.*/m.test(envContent)) {
    envContent = envContent.replace(
      /^GOOGLE_SHEET_ID=.*/m,
      `GOOGLE_SHEET_ID=${sheetId}`
    );
  } else {
    envContent = envContent.trimEnd() + `\nGOOGLE_SHEET_ID=${sheetId}\n`;
  }
  fs.writeFileSync(ENV_PATH, envContent);
}

async function getOrCreateSheet(sheets, drive) {
  const existingId = process.env.GOOGLE_SHEET_ID;

  if (existingId) {
    return existingId;
  }

  // Create a new spreadsheet
  const created = await sheets.spreadsheets.create({
    resource: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: "Records" } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  const sheetId = created.data.sheets[0].properties.sheetId;
  saveSheetId(spreadsheetId);
  process.env.GOOGLE_SHEET_ID = spreadsheetId;

  // Move into the ALL TECH shared folder
  const currentFile = await drive.files.get({ fileId: spreadsheetId, fields: "parents", supportsAllDrives: true });
  const prevParents = (currentFile.data.parents || []).join(",");
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: ALL_TECH_FOLDER_ID,
    removeParents: prevParents,
    supportsAllDrives: true,
    fields: "id, parents",
  });

  // Write the two header rows
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Records!A1",
    valueInputOption: "RAW",
    resource: { values: [GROUP_ROW, HEADER_ROW] },
  });

  // Freeze rows 1 & 2
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 2 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    },
  });

  console.log(`  Google Sheet created: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  return spreadsheetId;
}

export async function appendRowToSheet(id, record) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const drive  = google.drive({ version: "v3", auth });

  const spreadsheetId = await getOrCreateSheet(sheets, drive);

  const now = new Date().toISOString();
  const coreFields = [
    id,
    record.category,
    record.title,
    record.location       ?? "",
    record.city           ?? "",
    record.state          ?? "",
    record.country        ?? "",
    record.description    ?? "",
    record.source_url     ?? "",
    record.source_name    ?? "",
    record.confidence_score  ?? "",
    record.confidence_level  ?? "",
    record.status         ?? "",
    now,   // date_fetched
    now,   // last_verified
    now,   // created_at
    now,   // updated_at
  ];

  const dataFields = flattenData(record.data);
  const row = [...coreFields, ...dataFields];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Records!A3",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [row] },
  });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`  Row added to Google Sheet: ${sheetUrl}`);
}

/**
 * Reads all data rows (row 3 onwards) from the sheet.
 * Returns an array of { city, rowNumber, isComplete } objects.
 * isComplete = true only when every one of the 29 data columns is non-empty.
 */
export async function getSheetRows() {
  const auth    = getAuthClient();
  const sheets  = google.sheets({ version: "v4", auth });
  const drive   = google.drive({ version: "v3", auth });

  const spreadsheetId = await getOrCreateSheet(sheets, drive);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Records!A3:AZ",
  });

  const rows = res.data.values || [];

  return rows
    .map((row, i) => {
      const city = (row[4] || "").trim();   // Column E = City (0-based index 4)
      // Data columns: indices 17–51 (35 columns across all 5 categories)
      const dataCols = row.slice(17, 52);
      const isComplete =
        dataCols.length === 35 &&
        dataCols.every(v => v && String(v).trim().length > 0);
      return {
        city,
        rowNumber: i + 3,   // 1-based sheet row (first data row = row 3)
        isComplete,
      };
    })
    .filter(r => r.city.length > 0);
}

/**
 * Overwrites an existing incomplete row (identified by 1-based rowNumber)
 * with a freshly researched city profile — all columns filled.
 */
export async function updateCityProfileRow(rowNumber, profile) {
  const auth    = getAuthClient();
  const sheets  = google.sheets({ version: "v4", auth });
  const drive   = google.drive({ version: "v3", auth });

  const spreadsheetId = await getOrCreateSheet(sheets, drive);
  const now = new Date().toISOString();
  const id  = uuidv4();

  const s = (v) => (v == null ? "" : String(v).trim());

  const row = [
    id,
    "city_profile",
    `${profile.city}, ${profile.state} — Comprehensive City Profile`,
    `${profile.city}, ${profile.state}`,
    profile.city,
    profile.state,
    "United States",
    `Comprehensive entrepreneur dataset for ${profile.city}, ${profile.state}: economic indicators, business ecosystem, grants, policy incentives, and relocation costs.`,
    s(profile.primarySourceUrl),
    "Multiple Public Sources (Census, SBA, City Gov, Chamber)",
    85, "high", "active",
    now, now, now, now,
    // CITY ECONOMIC DATA (11 cols)
    s(profile.cost_of_living),
    s(profile.cost_index),
    s(profile.housing_rent_estimates),
    s(profile.housing_index_score),
    s(profile.median_income),
    s(profile.employment_indicators),
    s(profile.industry_strengths),
    s(profile.business_environment),
    s(profile.minority_representation),
    s(profile.underrepresented_entrepreneurs_pct),
    s(profile.opportunity_score),
    // BUSINESS ECOSYSTEM (8 cols)
    s(profile.incubators_accelerators),
    s(profile.coworking_spaces),
    s(profile.startup_hubs),
    s(profile.mentorship_networks),
    s(profile.network_strength),
    s(profile.chambers_of_commerce),
    s(profile.black_business_organizations),
    s(profile.business_score),
    // GRANTS & FUNDING
    s(profile.grant_name),
    s(profile.funder),
    s(profile.eligibility_criteria),
    s(profile.funding_amount),
    s(profile.deadline),
    s(profile.application_link),
    s(profile.geographic_scope),
    s(profile.target_audience),
    // POLICY INCENTIVES
    s(profile.tax_incentives),
    s(profile.startup_support_programs),
    s(profile.minority_business_certifications),
    s(profile.government_backed_initiatives),
    // COST & RELOCATION DATA
    s(profile.living_expenses),
    s(profile.business_setup_costs),
    s(profile.hiring_costs),
    s(profile.utilities_and_infrastructure),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Records!A${rowNumber}`,
    valueInputOption: "RAW",
    resource: { values: [row] },
  });

  console.log(`  Row ${rowNumber} updated for ${profile.city} → https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

/**
 * Writes ONE comprehensive city-profile row with ALL 46 columns filled.
 * Called by cityProfileAgent.js.
 *
 * @param {object} profile — flat object with all city data fields
 */
export async function appendCityProfileRow(profile) {
  const auth    = getAuthClient();
  const sheets  = google.sheets({ version: "v4", auth });
  const drive   = google.drive({ version: "v3", auth });

  const spreadsheetId = await getOrCreateSheet(sheets, drive);
  const now = new Date().toISOString();
  const id  = uuidv4();

  const s = (v) => (v == null ? "" : String(v).trim());

  const row = [
    // ── CORE (17 cols) ──────────────────────────────────────────────────────
    id,
    "city_profile",
    `${profile.city}, ${profile.state} — Comprehensive City Profile`,
    `${profile.city}, ${profile.state}`,
    profile.city,
    profile.state,
    "United States",
    `Comprehensive entrepreneur dataset for ${profile.city}, ${profile.state}: economic indicators, business ecosystem, grants, policy incentives, and relocation costs.`,
    s(profile.primarySourceUrl),
    "Multiple Public Sources (Census, SBA, City Gov, Chamber)",
    85,       // confidence_score
    "high",   // confidence_level
    "active", // status
    now,      // date_fetched
    now,      // last_verified
    now,      // created_at
    now,      // updated_at

    // ── CITY ECONOMIC DATA (11 cols) ────────────────────────────────────────
    s(profile.cost_of_living),
    s(profile.cost_index),
    s(profile.housing_rent_estimates),
    s(profile.housing_index_score),
    s(profile.median_income),
    s(profile.employment_indicators),
    s(profile.industry_strengths),
    s(profile.business_environment),
    s(profile.minority_representation),
    s(profile.underrepresented_entrepreneurs_pct),
    s(profile.opportunity_score),

    // ── BUSINESS ECOSYSTEM (8 cols) ─────────────────────────────────────────
    s(profile.incubators_accelerators),
    s(profile.coworking_spaces),
    s(profile.startup_hubs),
    s(profile.mentorship_networks),
    s(profile.network_strength),
    s(profile.chambers_of_commerce),
    s(profile.black_business_organizations),
    s(profile.business_score),

    // ── GRANTS & FUNDING (8 cols) ───────────────────────────────────────────
    s(profile.grant_name),
    s(profile.funder),
    s(profile.eligibility_criteria),
    s(profile.funding_amount),
    s(profile.deadline),
    s(profile.application_link),
    s(profile.geographic_scope),
    s(profile.target_audience),

    // ── POLICY INCENTIVES (4 cols) ──────────────────────────────────────────
    s(profile.tax_incentives),
    s(profile.startup_support_programs),
    s(profile.minority_business_certifications),
    s(profile.government_backed_initiatives),

    // ── COST & RELOCATION DATA (4 cols) ─────────────────────────────────────
    s(profile.living_expenses),
    s(profile.business_setup_costs),
    s(profile.hiring_costs),
    s(profile.utilities_and_infrastructure),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Records!A3",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [row] },
  });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`  City profile row written for ${profile.city} → ${sheetUrl}`);
}

/**
 * Reads ALL city profile rows from the sheet and returns them as structured
 * objects keyed by the column header names from row 2 (HEADER_ROW).
 * This is what Faro Chat reads to answer user questions.
 *
 * Returns an array like:
 * [
 *   {
 *     "City": "Atlanta", "State": "Georgia",
 *     "Cost of Living": "...", "Grant Name": "...", ...
 *   },
 *   ...
 * ]
 */
export async function readAllCityProfiles() {
  const auth    = getAuthClient();
  const sheets  = google.sheets({ version: "v4", auth });
  const drive   = google.drive({ version: "v3", auth });

  const spreadsheetId = await getOrCreateSheet(sheets, drive);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Records!A1:AZ",
  });

  const rows = res.data.values || [];
  if (rows.length < 3) return [];

  // Row 2 (index 1) = column headers
  const headers = rows[1];

  return rows
    .slice(2)                          // skip group row + header row
    .map(row => {
      const profile = {};
      headers.forEach((header, i) => {
        profile[header] = (row[i] || "").trim();
      });
      return profile;
    })
    .filter(p => p["City"] && p["City"].length > 0);
}
