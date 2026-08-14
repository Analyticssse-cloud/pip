const fs = require("fs");
const path = require("path");
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { google } = require("googleapis");

const CLUSTER = (process.argv[2] || "Pune").toLowerCase();
const norm = (e) => String(e || "").trim().toLowerCase().replace("@homes.solarsquare.in", "@solarsquare.in");
const isEmail = (s) => /@(homes\.)?solarsquare\.in$/i.test(String(s || "").trim());
const hrs = (v) => { const m = String(v || "").match(/^(\d+):(\d+):(\d+)/); return m ? +m[1] + +m[2] / 60 + +m[3] / 3600 : null; };

async function tab(sheets, name, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_LRM_BAND_ID, range: `${name}!${range}`, valueRenderOption: "FORMATTED_VALUE" });
    return res.data.values || [];
  } catch (e) { console.log(`  (warn) ${name}: ${e.message}`); return []; }
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString("utf8")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // MD_DD — the anchor. Header row 1; daily columns are date-headed from col L (index 11).
  const md = await tab(sheets, "MD_DD", "A1:BZ500");
  const mdHead = md[0] || [];
  const dailyCols = [];
  mdHead.forEach((h, i) => { if (/^\d+\s+\w+\s+\d{4}$/.test(String(h).trim())) dailyCols.push(i); });

  const roster = new Map();
  for (let r = 1; r < md.length; r++) {
    const row = md[r]; if (!row || !isEmail(row[0])) continue;
    if (String(row[5] || "").toLowerCase() !== CLUSTER) continue; // col F = cluster
    const daily = dailyCols.map((i) => Number(String(row[i]).replace(/,/g, "")) || 0);
    roster.set(norm(row[0]), {
      email: norm(row[0]), cluster: row[5],
      target: Number(row[2]) || 0, ach: Number(row[3]) || 0,
      tenure: Number(row[6]) || 0, avg: Number(row[9]) || 0,
      daily,
    });
  }

  // Emply_data — TL/ZSM/DOJ
  const emp = await tab(sheets, "Emply_data", "A1:L2000");
  for (let r = 1; r < emp.length; r++) {
    const row = emp[r]; const e = norm(row[1]); const rec = roster.get(e); if (!rec) continue;
    rec.doj = row[2]; rec.tl = row[7] || row[11]; rec.zsm = row[6] || row[10];
  }

  // Active Lead — live leads (ADOS). Find header row where col0 == "LRM Email ID".
  const al = await tab(sheets, "Active Lead", "A1:F3000");
  let alStart = al.findIndex((row) => String(row?.[0]).trim() === "LRM Email ID");
  for (let r = alStart + 1; r < al.length; r++) {
    const row = al[r]; const e = norm(row?.[0]); const rec = roster.get(e); if (!rec) continue;
    const n = row.slice(1).map((c) => Number(String(c).replace(/,/g, ""))).find((x) => Number.isFinite(x));
    rec.cal = n ?? 0;
  }

  // Detailed — productive hours, averaged per email over non-blank days
  const det = await tab(sheets, "Detailed", "A1:E5000");
  const ph = new Map();
  for (let r = 1; r < det.length; r++) {
    const row = det[r]; const e = norm(row?.[4]); if (!roster.has(e)) continue;
    const h = hrs(row[3]); if (h == null) continue;
    const a = ph.get(e) || []; a.push(h); ph.set(e, a);
  }
  for (const [e, a] of ph) roster.get(e).prod = a.reduce((s, x) => s + x, 0) / a.length;

  // Initial_Lead Assigned — avg lead score by current LRM email
  const ila = await tab(sheets, "Initial_Lead Assigned", "A1:F20000");
  const sc = new Map();
  for (let r = 1; r < ila.length; r++) {
    const row = ila[r]; const e = norm(row?.[4]); if (!roster.has(e)) continue;
    const s = Number(row[5]); if (!Number.isFinite(s)) continue;
    const a = sc.get(e) || []; a.push(s); sc.set(e, a);
  }
  for (const [e, a] of sc) roster.get(e).score = a.reduce((s, x) => s + x, 0) / a.length;

  const out = [...roster.values()];
  console.log(`\n${out.length} LRMs in cluster "${process.argv[2] || "Pune"}" (daily cols found: ${dailyCols.length})\n`);
  for (const l of out) {
    console.log(`${l.email.padEnd(38)} tgt=${String(l.target).padStart(4)} ach=${String(l.ach).padStart(4)} avg=${(l.avg||0).toFixed(1).padStart(5)} ten=${String(l.tenure).padStart(4)} cal=${String(l.cal??"-").padStart(4)} prod=${(l.prod??0).toFixed(1).padStart(5)} score=${(l.score??0).toFixed(2).padStart(5)} tl=${l.tl||"-"}`);
  }
}
main().catch((e) => { console.error("Error:", e.message); process.exit(1); });