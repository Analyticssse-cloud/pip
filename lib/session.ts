// lib/session.ts — resolve the authenticated user to a role for the tracker.
//
//   manager (TL / ZSM)  — sees the whole cluster and can edit coaching plans.
//   lrm                 — sees only their own plan, read-only.
//
// The rule: an email that matches a roster record IS that LRM (role "lrm", scoped to self);
// anyone else on the allowed domains is a manager (there is no per-cluster visibility gate yet).
import type { LrmMetrics } from "./metrics";

export type Role = "manager" | "lrm";

export interface AppSession {
  email: string;
  name: string;
  role: Role;
  lrmId?: string; // set when role === "lrm"
}

export const AUTH_CONFIGURED = Boolean(process.env.AUTH_GOOGLE_ID);

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase().replace("@homes.solarsquare.in", "@solarsquare.in");
}

export function resolveSession(email: string, name: string, roster: LrmMetrics[]): AppSession {
  const norm = normalizeEmail(email);
  const self = roster.find(l => normalizeEmail(l.email) === norm);
  return self
    ? { email: norm, name: self.name, role: "lrm", lrmId: self.id }
    : { email: norm, name, role: "manager" };
}
