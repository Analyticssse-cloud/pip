// app/signin/page.tsx — the sign-in screen (Google, team domains only).
import { redirect } from "next/navigation";
import Blueprint from "@/components/Blueprint";
import { AUTH_CONFIGURED } from "@/lib/session";

export default function SignIn() {
  if (!AUTH_CONFIGURED) redirect("/"); // demo mode has no login

  async function login() {
    "use server";
    const { signIn } = await import("@/lib/auth");
    await signIn("google", { redirectTo: "/" });
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Blueprint style={{ padding: "var(--space-8)", width: "min(420px, 100%)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 24 }}>LRM Performance Improvement Tracker</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>Sign in with your SolarSquare Google account. Access is limited to the team.</p>
        </div>
        <form action={login}>
          <button type="submit" className="btn btn-primary btn-block">Continue with Google</button>
        </form>
      </Blueprint>
    </main>
  );
}
