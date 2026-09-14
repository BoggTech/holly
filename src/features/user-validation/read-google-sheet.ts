import { readFileSync } from "node:fs";
import { join } from "node:path";
import { google } from "googleapis";

const TOKEN_PATH = join(process.cwd(), "secrets/google-token.json");

/**
 * Retrieve email addresses from the Google Sheet, provided the Sheet ID and range are correct,
 * and secrets/google-token.json exists
 *
 * @returns {string[]} - List of emails from the Google Sheet
 */
export async function getEmails(): Promise<string[]> {
  const client = await authorize();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheets = google.sheets({ version: "v4", auth: client as any });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SIGNUP_SHEET_ID,
    range: process.env.SIGNUP_SHEET_RANGE,
  });

  if (!res.data.values) throw new Error("No data found in Google Sheet");

  return res.data.values
    .slice(1)
    .map((value) => value[0]);
}

/**
 * Use secrets/google-token.json and secrets/google-credentials.json to authenticate with Google,
 * so we can read the spreadsheet
 *
 * @returns Authenticated client for interacting with Google Sheets
 */
async function authorize() {
  // Attempt to read credentials from token.json
  const credentials = JSON.parse(readFileSync(TOKEN_PATH).toString());
  const authCredentials = google.auth.fromJSON(credentials);
  return authCredentials;
}
