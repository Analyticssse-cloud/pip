// lib/sample.ts — the bundled sample roster, ported verbatim from the prototype's DATA array.
// Used when DATABASE_URL is unset (or the DB has no roster yet) so a fresh deploy renders
// immediately. Replace with live data via the sync job (see app/api/sync/route.ts).
import type { LrmMetrics, Thresholds } from "./metrics";

export const MANAGER_EMAIL = "akshay.shrivant@solarsquare.in";
export const CLUSTER = "Pune";

// working-day count the prototype used for MD+DD/day averaging
export const SAMPLE_THRESHOLDS: Thresholds = { benchmark: 4, tenureGuard: 60, workingDays: 26 };

// id -> display name (prototype's nameOf: title-case the dotted local part, drop digits)
function nameOf(id: string): string {
  return id.split(".").map(p => p.replace(/\d/g, "")).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

type Raw = {
  id: string; city: string; tl: string; zsm: string;
  tenure: number; target: number; ach: number; cal: number;
  score: number; prod: number; conv: number; weeks: [number, number, number, number];
};

const RAW: Raw[] = [
  { id: "mustaqueem.wate", city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 412, target: 200, ach: 285, cal: 191, score: 6.76, prod: 6.2, conv: 44, weeks: [9.8, 10.4, 11.2, 11.9] },
  { id: "manjunatha.r",    city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 268, target: 220, ach: 214, cal: 164, score: 6.41, prod: 4.9, conv: 39, weeks: [7.6, 8.0, 8.4, 8.6] },
  { id: "monika.s",        city: "Pimpri", tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 190, target: 150, ach: 173, cal: 168, score: 6.95, prod: 7.1, conv: 37, weeks: [6.1, 6.4, 6.9, 7.1] },
  { id: "akansha.r",       city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 154, target: 180, ach: 132, cal: 134, score: 6.26, prod: 6.5, conv: 33, weeks: [4.6, 4.9, 5.1, 5.5] },
  { id: "gaurav.jethliya", city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 96,  target: 170, ach: 95,  cal: 124, score: 6.46, prod: 6.3, conv: 26, weeks: [2.9, 3.2, 3.7, 4.6] },
  { id: "aastha.j",        city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 221, target: 180, ach: 87,  cal: 98,  score: 6.47, prod: 5.1, conv: 32, weeks: [3.6, 3.4, 3.2, 3.1] },
  { id: "bhargavi.j",      city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 78,  target: 210, ach: 55,  cal: 96,  score: 6.42, prod: 6.5, conv: 14, weeks: [2.6, 2.2, 1.9, 1.6] },
  { id: "ashmi.kiruba",    city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 96,  target: 150, ach: 35,  cal: 19,  score: 6.90, prod: 4.6, conv: 30, weeks: [0.9, 1.2, 1.5, 1.9] },
  { id: "pragati.kaltari", city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 34,  target: 50,  ach: 19,  cal: 88,  score: 4.85, prod: 4.5, conv: 24, weeks: [0.4, 0.6, 0.8, 1.1] },
  { id: "yogeswari.babu",  city: "Pune",   tl: "Akshay Shrivant", zsm: "Shivam Bhagat", tenure: 210, target: 0,   ach: 0,   cal: 0,   score: 0,    prod: 0,   conv: 0,  weeks: [0, 0, 0, 0] },
];

export const SAMPLE_LRMS: LrmMetrics[] = RAW.map(r => ({
  id: r.id,
  name: nameOf(r.id),
  email: `${r.id}@solarsquare.in`,
  tl: r.tl,
  zsm: r.zsm,
  city: r.city,
  tenureDays: r.tenure,
  target: r.target,
  ach: r.ach,
  cal: r.cal,
  oal: r.cal,
  leadScore: r.score,
  prod: r.prod,
  conv: r.conv,
  weeks: r.weeks,
}));
