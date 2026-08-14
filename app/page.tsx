// app/page.tsx — the authenticated tracker shell (Server Component).
// Resolves session -> role, loads the cluster, and hands off to the client Shell.
//
// DEMO mode: when AUTH_GOOGLE_ID is unset there is no login — the page opens as a
// manager (TL) with an in-app "Signed in as" switcher so the role model can be demoed.
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { loadCluster } from "@/lib/data";
import { AUTH_CONFIGURED, resolveSession, type AppSession } from "@/lib/session";
import { MANAGER_EMAIL } from "@/lib/sample";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadCluster();

  let session: AppSession;

  if (!AUTH_CONFIGURED) {
    // Demo: no OAuth configured yet.
    session = { email: MANAGER_EMAIL, name: "Akshay Shrivant", role: "manager" };
    return <Shell data={data} session={session} demo />;
  }

  const { auth } = await import("@/lib/auth");
  const s = await auth();
  const email = s?.user?.email;
  if (!email) redirect("/signin");

  session = resolveSession(email, s?.user?.name ?? email, data.lrms);
  return <Shell data={data} session={session} demo={false} />;
}
