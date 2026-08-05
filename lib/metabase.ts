// lib/metabase.ts — read-replica query client for the fields the band sheet
// doesn't carry: per-day MD+DD (and the four weekly buckets) and BQL→MD
// conversion (DATA_MODEL.md §1–2). Not wired into app/api/sync/route.ts yet —
// today the sync job only upserts the band-sheet columns, and `mdDd`/`weeks`
// stay 0 until this is finished. Wiring it in is the clean follow-up the
// starter docs call out.
//
// Apply the solarsquare-sql conventions when you fill this in: bound every
// scan to the cluster's LRMs + the cycle window before joining big tables,
// wrap in retry-with-backoff (the replica throws recovery-conflict errors on
// long scans), regex-guard any text-date cast, and normalize email on every
// people-join (`LOWER(TRIM(REPLACE(email,'@homes.solarsquare.in','@solarsquare.in')))`).

export interface MetabaseRow {
  [column: string]: string | number | null;
}

async function metabaseSessionToken(): Promise<string> {
  const res = await fetch(`${process.env.METABASE_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.METABASE_USER,
      password: process.env.METABASE_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Metabase login failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Run a saved Metabase question ("card") and return its rows as objects.
 * `parameters` maps to the card's template tags (e.g. cluster, cycle window).
 */
export async function runMetabaseCard(
  cardId: string,
  parameters: Record<string, string | number> = {}
): Promise<MetabaseRow[]> {
  const token = await metabaseSessionToken();
  const res = await fetch(`${process.env.METABASE_URL}/api/card/${cardId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Metabase-Session": token },
    body: JSON.stringify({ parameters }),
  });
  if (!res.ok) throw new Error(`Metabase query failed: ${res.status}`);
  const data = (await res.json()) as {
    data: { cols: { name: string }[]; rows: (string | number | null)[][] };
  };
  const cols = data.data.cols.map((c) => c.name);
  return data.data.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}
