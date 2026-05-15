/**
 * clearSheetData.js
 * Clears all data rows (row 3+) and rewrites the header rows with the
 * latest column structure (GROUP_ROW + HEADER_ROW).
 *
 * Usage: node clearSheetData.js
 */

import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { getAuthClient } from "./googleAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config();

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
if (!spreadsheetId) {
  console.error("GOOGLE_SHEET_ID not set in .env.local");
  process.exit(1);
}

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

const auth   = getAuthClient();
const sheets = google.sheets({ version: "v4", auth });

// 1. Find out how many rows have data
const dataRange = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: "Records!A1:A",
});
const dataRows = (dataRange.data.values || []).length;
console.log(`Rows with data: ${dataRows}`);

// 2. Clear all rows from row 3 downward (if any)
if (dataRows > 2) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `Records!A3:AZ${dataRows}`,
  });
  console.log(`Cleared ${dataRows - 2} data rows.`);
} else {
  console.log("No data rows to clear.");
}

// 3. Rewrite header rows 1 & 2 with latest column structure
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: "Records!A1",
  valueInputOption: "RAW",
  resource: { values: [GROUP_ROW, HEADER_ROW] },
});
console.log("Header rows rewritten with latest column structure.");
console.log(`Sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
