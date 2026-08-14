// components/uiHelpers.ts — small presentational helpers shared by the views
// (band tag colors, week-on-week delta formatting). Pure; no state.
import type { Band } from "@/lib/metrics";

export interface TagColors { bg: string; fg: string; border?: string }

export function bandColors(band: Band): TagColors {
  switch (band) {
    case "No action":      return { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
    case "Observe":        return { bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case "Train":          return { bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" };
    case "PIP / exit":     return { bg: "var(--color-accent-900)", fg: "var(--color-bg)" };
    case "Fix allocation": return { bg: "transparent", fg: "var(--color-accent-700)", border: "var(--color-accent)" };
  }
}

export function deltaBits(d: number): { label: string; fg: string } {
  if (Math.abs(d) < 0.05) return { label: "—", fg: "color-mix(in srgb, var(--color-text) 45%, transparent)" };
  if (d > 0) return { label: `▲ +${d.toFixed(1)}`, fg: "var(--color-accent-700)" };
  return { label: `▼ ${d.toFixed(1)}`, fg: "var(--color-accent-900)" };
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
