import { Suspense, lazy, useEffect, useState } from "react";
import { central, has, session, tenant as tenantApi, type Me, type MeTenant } from "./api";
import { ErrorBox, Link, go, useRoute } from "./ui";
// Each page is its own chunk, downloaded the first time it is opened.
const Stacks = lazy(() => import("./pages/Stacks"));
const StackNew = lazy(() => import("./pages/StackNew"));
const StackDetail = lazy(() => import("./pages/StackDetail"));
const Runs = lazy(() => import("./pages/Runs"));
const RunDetail = lazy(() => import("./pages/RunDetail"));
const CatalogPage = lazy(() => import("./pages/Catalog"));
const Audit = lazy(() => import("./pages/Audit"));
const Platform = lazy(() => import("./pages/Platform"));
const Account = lazy(() => import("./pages/Account"));
const Policies = lazy(() => import("./pages/Policies"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Integrations = lazy(() => import("./pages/integrations/Integrations"));
const Settings = lazy(() => import("./pages/settings/Settings"));

// Tenant admins see every settings section; entity (product) admins see
// Organisation, where they manage their products' shared environments.
const canOpenSettings = (ctx: Ctx) => has(ctx.t, "tenant_admin") || ctx.t.entities.some(e => e.roles.includes("admin"));

// Everything a tenant page needs: who is signed in, which tenant, its API,
// and the scope filter: "" (everything visible), "entity:<slug>" or "bu:<slug>".
export interface Ctx {
  me: Me;
  t: MeTenant;
  api: ReturnType<typeof tenantApi>;
  scope: string;
}

export const inScope = (ctx: Ctx, bu: string, entity: string) =>
  !ctx.scope || ctx.scope === `bu:${bu}` || ctx.scope === `entity:${entity}`;

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [scope, setScope] = useState("");
  const route = useRoute();

  useEffect(() => {
    // Returning from SSO: swap the one-time code for a session token.
    const sso = window.location.hash.match(/^#\/sso\/([A-Za-z0-9_-]+)$/);
    const start = sso
      ? central.exchange(sso[1]).then(r => { session.set(r.secret); window.location.hash = "/"; })
      : Promise.resolve();
    setChecking(true);
    start.then(() => (session.get() ? central.me().then(setMe, () => session.clear()) : undefined))
      .catch(() => window.location.hash = "/login?sso_error=expired")
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!me) return <Login onLogin={setMe} />;

  // Routes: t/{tenant}/{page}/{id}, platform, account.
  const inTenant = route[0] === "t";
  const slug = inTenant ? route[1] : "";
  const t = me.tenants.find(x => x.slug === slug);
  if (!inTenant && route[0] !== "platform" && route[0] !== "account") {
    if (me.tenants[0]) go(`t/${me.tenants[0].slug}/stacks`);
    else if (me.user.platform_admin) go("platform");
    else go("account");
    return null;
  }
  const [page, id] = inTenant ? route.slice(2) : route;
  const ctx: Ctx | null = t ? { me, t, api: tenantApi(t.slug), scope } : null;
  const base = t ? `t/${t.slug}/` : "";

  let body;
  if (route[0] === "platform") body = <Platform me={me} />;
  else if (route[0] === "account") body = <Account me={me} />;
  else if (!ctx) body = <ErrorBox error={new Error(`You have no access to tenant "${slug}".`)} />;
  else switch (page) {
    case "stacks": body = id === "new" ? <StackNew ctx={ctx} /> : id ? <StackDetail ctx={ctx} id={id} /> : <Stacks ctx={ctx} />; break;
    case "runs": body = id ? <RunDetail ctx={ctx} id={id} /> : <Runs ctx={ctx} />; break;
    case "catalog": body = <CatalogPage ctx={ctx} />; break;
    case "environments": body = <Settings ctx={ctx} section="organisation" />; break; // old link
    case "connections": body = <Integrations ctx={ctx} route={["cloud"]} />; break; // old link
    case "policies": body = <Policies ctx={ctx} />; break;
    case "audit": body = <Audit ctx={ctx} />; break;
    case "settings": body = <Settings ctx={ctx} section={id} />; break;
    case "assistant": body = <Assistant ctx={ctx} />; break;
    case "integrations": body = <Integrations ctx={ctx} route={route.slice(3)} />; break;
    default: body = <Stacks ctx={ctx} />;
  }

  const nav: [string, string, boolean][] = t ? [
    ["stacks", "Stacks", true], ["runs", "Runs", true], ["catalog", "Module catalog", true],
    ["integrations", "Integrations", true], ["policies", "Policies", true], ["audit", "Audit log", true], ["assistant", "Assistant", true],
    ["settings", "Tenant settings", !!ctx && canOpenSettings(ctx)],
  ] : [];

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand"><img src="/favicon.svg" alt="" /> Cloud Pravaha</div>
        {me.tenants.length > 0 && (
          <div className="switcher">
            <label htmlFor="tenant-pick">Tenant</label>
            <select id="tenant-pick" value={slug} onChange={e => { setScope(""); go(`t/${e.target.value}/stacks`); }}>
              {!t && <option value="">Choose…</option>}
              {me.tenants.map(x => <option key={x.slug} value={x.slug}>{x.name}</option>)}
            </select>
            {t && (
              <>
                <label htmlFor="scope-pick">Product / business unit</label>
                <select id="scope-pick" value={scope} onChange={e => setScope(e.target.value)}>
                  <option value="">All I can see</option>
                  {t.entities.map(e => (
                    <optgroup key={e.slug} label={e.name}>
                      <option value={`entity:${e.slug}`}>All of {e.name}</option>
                      {e.bus.map(b => <option key={b.slug} value={`bu:${b.slug}`}>{b.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
        {nav.filter(n => n[2]).map(([to, label]) => <Link key={to} to={base + to} className={page === to ? "on" : ""}>{label}</Link>)}
        <div className="side-sep" />
        {me.user.platform_admin && <Link to="platform" className={route[0] === "platform" ? "on" : ""}>Platform</Link>}
        <Link to="account" className={route[0] === "account" ? "on" : ""}>My tokens</Link>
        <div className="who">
          <div><strong>{me.user.email}</strong></div>
          {t && <div className="muted small">{[...(t.platform_admin ? ["platform admin"] : []), ...t.tenant_roles,
            ...t.entities.filter(e => e.roles.length).map(e => `${e.roles.join("/")} @ ${e.slug}`),
            ...t.entities.flatMap(e => e.bus.filter(b => b.roles.some(r => !e.roles.includes(r))).map(b => `${b.roles.filter(r => !e.roles.includes(r)).join("/")} @ ${b.slug}`))].join(", ") || "no roles"}</div>}
          <button className="ghost small" style={{ marginTop: 8 }} onClick={() => { central.logout().catch(() => {}).finally(() => { session.clear(); setMe(null); }); }}>Sign out</button>
        </div>
      </nav>
      <main><Suspense fallback={<p className="muted">Loading…</p>}>{body}</Suspense></main>
    </div>
  );
}

const ssoErrors: Record<string, string> = {
  no_access: "Your account has no access yet. Ask a tenant admin to add you.",
  email_not_verified: "Your identity provider did not confirm your email address.",
  domain_not_allowed: "Your email domain is not allowed to sign in here.",
  state_mismatch: "The sign-in could not be verified. Please try again.",
  expired: "The sign-in took too long. Please try again.",
};

function Login({ onLogin }: { onLogin: (m: Me) => void }) {
  const [token, setToken] = useState("");
  const [sso, setSso] = useState<{ sso: boolean; label: string } | null>(null);
  const code = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("sso_error");
  const [error, setError] = useState<unknown>(code ? new Error(ssoErrors[code] ?? "Sign-in failed (" + code + ").") : null);
  useEffect(() => { central.authConfig().then(setSso, () => {}); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    session.set(token.trim());
    try { onLogin(await central.me()); } catch (err) { session.clear(); setError(err); }
  };
  return (
    <div className="login panel">
      <div className="brand"><img src="/favicon.svg" alt="" /> Cloud Pravaha</div>
      <p className="muted">OpenTofu orchestration for every tenant and business unit, with pinned public modules only.</p>
      {sso?.sso && (
        <>
          <a href="/auth/login"><button type="button" style={{ width: "100%" }}>{sso.label}</button></a>
          <p className="muted small" style={{ textAlign: "center", margin: "12px 0" }}>or use an API token</p>
        </>
      )}
      <form onSubmit={submit}>
        <label htmlFor="tok">API token</label>
        <input id="tok" type="password" autoComplete="off" placeholder="pvh_u_…" value={token} onChange={e => setToken(e.target.value)} />
        <ErrorBox error={error} />
        <div className="row" style={{ marginTop: 14 }}><button disabled={!token.startsWith("pvh_u_")}>Sign in</button></div>
      </form>
      <p className="muted small">The token is kept in this tab only and cleared when you close it.</p>
    </div>
  );
}
