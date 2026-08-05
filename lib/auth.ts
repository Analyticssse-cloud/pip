// lib/auth.ts — Auth.js (NextAuth v5) Google provider locked to the company domains.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAINS = new Set(["solarsquare.in", "homes.solarsquare.in"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Pre-filter the Google account chooser to the org (NOT a security boundary).
      authorization: { params: { hd: "solarsquare.in", prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = (profile?.email ?? "").toLowerCase();
      const domain = email.split("@")[1];
      // Enforce server-side; email_verified guards unverified Google accounts.
      return Boolean(profile?.email_verified) && ALLOWED_DOMAINS.has(domain);
    },
    async session({ session }) {
      if (session.user?.email) {
        session.user.email = session.user.email
          .toLowerCase()
          .replace("@homes.solarsquare.in", "@solarsquare.in");
      }
      return session;
    },
  },
  pages: { signIn: "/signin" },
});
