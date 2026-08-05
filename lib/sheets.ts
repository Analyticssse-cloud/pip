// lib/sheets.ts — read the "Today's Plan" LRM band sheet and flatten it to per-LRM records.
//
// Source sheet (shared with the service account):
//   https://docs.google.com/spreadsheets/d/18-CHBpyH6pTPwp2LmFnhwTy8t78_PbCjc0mraNX5w_E
//
// SHAPE OF THE SHEET (important): it is a *presentation matrix*, not a clean table. LRMs are
// laid out in six band blocks (>=10 / 7-10 / 4-7 / 2-4 / 0-2 / 0 MD+DDs), each block repeating
// the same 8-column group, and the whole thing repeats per view (MTD, D-1, LMTD, LMTD D-1).
// Each LRM cell group is:
//   [ email, MD+DD Target, MD+DD Achieved, OAL, CAL, Avg lead Score, Productive Hour, owner ]
//     OAL = Originally Assigned Leads   CAL = Currently Assigned Leads (== "live leads")
//     owner column is TL or ZSM depending on the view; "Productive Hour" is a duration span.
//
// Two ways to consume it:
//   (A) Preferred long-term: don't parse this matrix at all — query Metabase for the same
//       columns per LRM (see DATA_MODEL.md §2) into clean rows.
//   (B) Fast path to parity today: parse the matrix. Because the layout is fixed, scan every
//       cell, treat any cell that looks like an email as the start of an 8-cell LRM group, and
//       read the next 7 cells positionally. De-dupe by email (an LRM can appear in MTD and D-1
//       blocks — keep the MTD/full-cycle figure for `ach`/`target`, the D-1 block for today).
//
// This file implements (B) defensively. Map by the email anchor, never by absolute column index.

import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_LRM_BAND_ID!; // 18-CHBpyH6pTPwp2LmFnhwTy8t78_PbCjc0mraNX5w_E

export interface SheetLrm {
  email: string;
  target: number | null;   // MD+DD Target
  ach: number | null;      // MD+DD Achieved
  oal: number | null;      // Originally Assigned Leads
  cal: number | null;      // Currently Assigned Leads (live leads)
  leadScore: number | null;
  productiveHrs: number | null;
  owner: string | null;    // TL or ZSM handle
}

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf8")
    ),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

const isEmail = (s: unknown): s is string =>
  typeof s === "string" && /@(homes\.)?solarsquare\.in$/i.test(s.trim());

export const normalizeEmail = (e: string) =>
  e.trim().toLowerCase().replace("@homes.solarsquare.in", "@solarsquare.in");

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "NA" || s.startsWith("#")) return null; // NA, #N/A, #REF!, #DIV/0!
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "Productive Hour" arrives as an HTML duration span, e.g.
//   <span type="duration" hours="7" minutes="22" seconds="37">7 h 22 m</span>
// or sometimes a bare "7 h 22 m". Return decimal hours.
export function parseProductiveHours(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v);
  const attr = s.match(/hours="(\d+)"\s+minutes="(\d+)"\s+seconds="(\d+)"/i);
  if (attr) return +attr[1] + +attr[2] / 60 + +attr[3] / 3600;
  const text = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (text) return +text[1] + +text[2] / 60;
  return toNum(s);
}

/**
 * Fetch the sheet and flatten to one record per LRM.
 * @param range e.g. "Today's Plan!A1:ZZ400" — pick the tab/range holding the MTD matrix.
 */
export async function fetchLrmBand(range: string): Promise<SheetLrm[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows: unknown[][] = (res.data.values as unknown[][]) ?? [];

  const byEmail = new Map<string, SheetLrm>();
  for (const row of rows) {
    for (let col = 0; col < row.length; col++) {
      if (!isEmail(row[col])) continue;
      const email = normalizeEmail(row[col] as string);
      // positional group starting at the email cell
      const rec: SheetLrm = {
        email,
        target: toNum(row[col + 1]),
        ach: toNum(row[col + 2]),
        oal: toNum(row[col + 3]),
        cal: toNum(row[col + 4]),
        leadScore: toNum(row[col + 5]),
        productiveHrs: parseProductiveHours(row[col + 6]),
        owner: (row[col + 7] as string)?.toString().trim() || null,
      };
      // keep the row with the most complete (highest ach) figure if seen twice
      const prev = byEmail.get(email);
      if (!prev || (rec.ach ?? -1) > (prev.ach ?? -1)) byEmail.set(email, rec);
      col += 7; // skip the group we just consumed
    }
  }
  return [...byEmail.values()];
}
