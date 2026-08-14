// lib/sheets.ts — multi-tab reader for the real SolarSquare LRM workbook.
//
// The original handoff assumed one tidy "Today's Plan" tab with a repeating
// 8-column block per LRM. The actual workbook
// (18-CHBpyH6pTPwp2LmFnhwTy8t78_PbCjc0mraNX5w_E) spreads the data across
// purpose-specific tabs, so this module reads each one and joins them by
// normalized email into a per-LRM record. Sources (confirmed against the live
// sheet + the "Data Source" tab):
//
//   MD_DD                 anchor: email, target, MD+DD total (ach), cluster,
//                         tenure (days), MD+DD/day avg, and per-day values.
//   Emply_data            TL / ZSM emails, DOJ, role, HR status.
//   Active Lead           live leads (the "ADOS" count) per LRM.
//   Detailed              per-day productive hours (H:MM:SS) -> averaged.
//   Initial_Lead Assigned lead score per lead -> averaged by current LRM.
//
// BQL->MD conversion is only cluster-level in the workbook (BQL<>MD tab), not
// per-LRM, so it is left at 0 here — the root-cause engine tolerates it.

import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_LRM_BAND_ID!;

export interface SheetDaily {
  date: string; // ISO yyyy-mm-dd
  mdDd: number;
}

export interface SheetLrm {
  email: string;
  name: string;
  cluster: string | null;
  tl: string | null;
  zsm: string | null;
  tenureDays: number | null;
  doj: string | null;
  target: number | null;
  ach: number | null; // MD+DD total (month/window to date)
  avgPerDay: number | null; // the sheet's own trusted MD+DD/day
  cal: number | null; // live leads (ADOS)
  oal: number | null;
  prod: number | null; // avg productive hours/day
  leadScore: number | null;
  daily: SheetDaily[]; // recent daily MD+DD, chronological
}

export const normalizeEmail = (e: unknown) =>
  String(e ?? "").trim().toLowerCase().replace("@homes.solarsquare.in", "@solarsquare.in");

const isEmail = (s: unknown): s is string =>
  typeof s === "string" && /@(homes\.)?solarsquare\.in$/i.test(s.trim());

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  if (s === "" || /^(NA|#)/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "7:05:15" (H:MM:SS) -> decimal hours.
function toHours(v: unknown): number | null {
  const m = String(v ?? "").match(/^(\d+):(\d+):(\d+)/);
  return m ? +m[1] + +m[2] / 60 + +m[3] / 3600 : null;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// "1 July 2026" -> "2026-07-01"; returns null if the header isn't a date.
function parseDateHeader(h: unknown): string | null {
  const m = String(h ?? "").trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon == null) return null;
  const d = new Date(Date.UTC(+m[3], mon, +m[1]));
  return d.toISOString().slice(0, 10);
}

/**
 * Read the service-account credentials from the environment.
 *
 * Accepts the key either base64-encoded or as raw JSON — pasting the raw file
 * into a dashboard env var is an easy mistake, and `Buffer.from(json,"base64")`
 * fails obscurely (it silently drops non-base64 characters and decodes the rest
 * into binary, so the error surfaces as "Unexpected token ... is not valid
 * JSON" rather than anything pointing at the key).
 */
function serviceAccountCredentials(): Record<string, string> {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  const text = raw.startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is neither valid JSON nor base64-encoded JSON " +
        `(decoded ${text.length} chars starting "${text.slice(0, 12)}")`
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email / private_key");
  }
  return parsed;
}

function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

type Sheets = ReturnType<typeof sheetsClient>;

async function readTab(sheets: Sheets, tab: string, range: string): Promise<unknown[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!${range}`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return (res.data.values as unknown[][]) ?? [];
  } catch {
    return [];
  }
}

function nameFromEmail(email: string): string {
  return email.split("@")[0].split(/[._]/)
    .filter((p) => !/^\d+$/.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const DAILY_WINDOW = 28; // keep the most recent 4 weeks of daily output

/**
 * Read the whole workbook and return one joined record per LRM in `cluster`.
 * Matching is by normalized email; the roster is driven by the MD_DD tab
 * (the LRMs actually being tracked), enriched from the other tabs.
 */
export async function fetchClusterRoster(cluster: string): Promise<SheetLrm[]> {
  const sheets = sheetsClient();
  const target = cluster.trim().toLowerCase();

  // --- MD_DD (anchor) ---
  const md = await readTab(sheets, "MD_DD", "A1:BZ1000");
  const head = (md[0] as unknown[]) ?? [];
  const col = (label: string) =>
    head.findIndex((h) => String(h ?? "").trim().toLowerCase() === label.toLowerCase());
  const iEmail = col("LRM Email ID") >= 0 ? col("LRM Email ID") : 0;
  const iTarget = col("MD+DD Target July");
  const iAch = col("MD+DD Total (till MTD)");
  const iCluster = col("Cluster");
  const iTenure = col("Tenure");
  const iAvg = col("MD+DD Avg -MTD");
  const dailyCols = head
    .map((h, i) => ({ i, date: parseDateHeader(h) }))
    .filter((c): c is { i: number; date: string } => c.date !== null);

  const byEmail = new Map<string, SheetLrm>();
  for (let r = 1; r < md.length; r++) {
    const row = md[r] as unknown[];
    if (!row || !isEmail(row[iEmail])) continue;
    const rowCluster = iCluster >= 0 ? String(row[iCluster] ?? "") : "";
    if (rowCluster.trim().toLowerCase() !== target) continue;

    const daily: SheetDaily[] = dailyCols
      .map((c) => ({ date: c.date, mdDd: toNum(row[c.i]) }))
      .filter((d): d is SheetDaily => d.mdDd !== null)
      .slice(-DAILY_WINDOW);

    const email = normalizeEmail(row[iEmail]);
    byEmail.set(email, {
      email,
      name: nameFromEmail(email),
      cluster: rowCluster || null,
      tl: null,
      zsm: null,
      tenureDays: iTenure >= 0 ? toNum(row[iTenure]) : null,
      doj: null,
      target: iTarget >= 0 ? toNum(row[iTarget]) : null,
      ach: iAch >= 0 ? toNum(row[iAch]) : null,
      avgPerDay: iAvg >= 0 ? toNum(row[iAvg]) : null,
      cal: null,
      oal: null,
      prod: null,
      leadScore: null,
      daily,
    });
  }

  if (byEmail.size === 0) return [];

  // --- Emply_data: TL / ZSM / DOJ ---
  const emp = await readTab(sheets, "Emply_data", "A1:L3000");
  for (let r = 1; r < emp.length; r++) {
    const row = emp[r] as unknown[];
    const rec = byEmail.get(normalizeEmail(row?.[1]));
    if (!rec) continue;
    rec.doj = (row[2] as string) ?? null;
    rec.tl = (row[7] as string) || (row[11] as string) || null;
    rec.zsm = (row[6] as string) || (row[10] as string) || null;
  }

  // --- Active Lead: live leads (ADOS). Header row is where col A == "LRM Email ID". ---
  const al = await readTab(sheets, "Active Lead", "A1:F5000");
  const alStart = al.findIndex((row) => String((row as unknown[])?.[0]).trim() === "LRM Email ID");
  for (let r = (alStart >= 0 ? alStart + 1 : 1); r < al.length; r++) {
    const row = al[r] as unknown[];
    const rec = byEmail.get(normalizeEmail(row?.[0]));
    if (!rec) continue;
    // the ADOS count is the first numeric cell after the email column
    const n = row.slice(1).map((c) => toNum(c)).find((x) => x !== null);
    rec.cal = n ?? 0;
  }

  // --- Detailed: productive hours, averaged per email over recorded days ---
  const det = await readTab(sheets, "Detailed", "A1:E10000");
  const hoursByEmail = new Map<string, number[]>();
  for (let r = 1; r < det.length; r++) {
    const row = det[r] as unknown[];
    const email = normalizeEmail(row?.[4]);
    if (!byEmail.has(email)) continue;
    const h = toHours(row[3]);
    if (h == null) continue;
    (hoursByEmail.get(email) ?? hoursByEmail.set(email, []).get(email)!).push(h);
  }
  for (const [email, hs] of hoursByEmail) {
    byEmail.get(email)!.prod = hs.reduce((s, x) => s + x, 0) / hs.length;
  }

  // --- Initial_Lead Assigned: avg lead score by current LRM; counts for CAL/OAL fallback ---
  const ila = await readTab(sheets, "Initial_Lead Assigned", "A1:F30000");
  const scoreByCurrent = new Map<string, number[]>();
  const oalByInitial = new Map<string, number>();
  for (let r = 1; r < ila.length; r++) {
    const row = ila[r] as unknown[];
    const current = normalizeEmail(row?.[4]);
    const initial = normalizeEmail(row?.[2]);
    if (byEmail.has(current)) {
      const s = toNum(row[5]);
      if (s !== null) (scoreByCurrent.get(current) ?? scoreByCurrent.set(current, []).get(current)!).push(s);
    }
    if (byEmail.has(initial)) oalByInitial.set(initial, (oalByInitial.get(initial) ?? 0) + 1);
  }
  for (const [email, ss] of scoreByCurrent) {
    byEmail.get(email)!.leadScore = ss.reduce((s, x) => s + x, 0) / ss.length;
  }
  for (const [email, n] of oalByInitial) byEmail.get(email)!.oal = n;

  return [...byEmail.values()];
}
