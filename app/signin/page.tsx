// app/signin/page.tsx — Auth.js's configured sign-in page (lib/auth.ts
// `pages.signIn`). Google login only, restricted server-side to the two
// company domains (ARCHITECTURE.md §3).
import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        padding: 16,
      }}
    >
      <div className="blueprint" style={{ padding: 32, width: 360, maxWidth: "100%", textAlign: "center" }}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 22, marginBottom: 8 }}>
          LRM Performance Improvement Tracker
        </div>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
          Sign in with your solarsquare.in or homes.solarsquare.in Google account.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn btn-primary btn-block" type="submit">
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
