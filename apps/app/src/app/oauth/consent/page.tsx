import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { brand } from "@founders/config";
import { MCP_FREE_CALLS_PER_DAY } from "@founders/core/limits";
import { getMemberships } from "@founders/core/repo";
import { LogoMark } from "@founders/ui";
import { auth } from "@/lib/auth";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Connect an app" };
export const dynamic = "force-dynamic";

const SCOPE_TEXT: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected until you disconnect it",
};

/**
 * OAuth consent for MCP clients (plan 12). The query is signed by the authorization server; we
 * verify it, show which app is asking (self-asserted name + the real redirect host), the scopes, and
 * the workspace the connection will use.
 */
export default async function Consent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  // Repeated params (ba_param) must all be kept, or the signature check fails.
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect(`/login?${qs.toString()}`);
  const ctx = await auth.$context;
  const valid = qs.has("sig") && (await verifyOAuthQueryParams(qs.toString(), ctx.secret).catch(() => false));
  const clientId = qs.get("client_id") ?? "";
  if (!valid || !clientId) {
    return <Shell><p className="text-[14px] text-muted">This connection request is invalid or has expired. Start again from the app you were connecting.</p></Shell>;
  }
  const client = (await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: h }).catch(() => null)) as { client_name?: string; redirect_uris?: string[] } | null;
  const redirectHost = (() => {
    try {
      return new URL(qs.get("redirect_uri") ?? client?.redirect_uris?.[0] ?? "").host || null;
    } catch {
      return null;
    }
  })();
  const scopes = (qs.get("scope") ?? "").split(" ").filter(Boolean);
  const orgs = await getMemberships(session.user.id);
  const active = (session.session as Record<string, unknown>).activeOrganizationId;
  return (
    <Shell>
      <h1 className="text-[20px] font-semibold text-ink">Connect {client?.client_name ?? "an app"} to {brand.name}</h1>
      <p className="mt-1 text-[13px] text-muted">
        Signed in as {session.user.email}. {redirectHost ? <>After you allow it, you'll return to <span className="text-ink">{redirectHost}</span>.</> : null}
      </p>
      <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-ink/90">
        <li>• Search and read companies, people, investors, rounds and signals</li>
        <li>• Read and change your lists and saved searches (the app asks before changing anything)</li>
        {scopes.map((s) => (SCOPE_TEXT[s] ? <li key={s}>• {SCOPE_TEXT[s]}</li> : null))}
        <li>• Use up to {MCP_FREE_CALLS_PER_DAY} free calls a day; beyond that, paid calls use workspace credits only if an admin allows it</li>
      </ul>
      <ConsentForm orgs={orgs.map((o) => ({ id: o.org_id, name: o.name }))} initialOrg={typeof active === "string" && orgs.some((o) => o.org_id === active) ? active : (orgs[0]?.org_id ?? "")} clientName={client?.client_name ?? "this app"} />
      <p className="mt-4 text-[11.5px] text-faint">The app's name is provided by the app itself. Only continue if you started this connection. You can disconnect it any time in Settings → MCP.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-[480px] rounded-2xl border border-line bg-sunken p-7">
        <LogoMark size={30} className="mb-5" />
        {children}
      </div>
    </main>
  );
}
