import { useEffect, useState } from "react";
import { central, has, session, tenant as tenantApi, type Me, type MeTenant } from "./api";
import { ErrorBox, Link, go, useRoute } from "./ui";
import Stacks from "./pages/Stacks";
import StackNew from "./pages/StackNew";
import StackDetail from "./pages/StackDetail";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import CatalogPage from "./pages/Catalog";
import Environments from "./pages/Environments";
import Audit from "./pages/Audit";
import TenantAdmin from "./pages/TenantAdmin";
import Platform from "./pages/Platform";
import Account from "./pages/Account";

// Everything a tenant page needs: who is signed in, which tenant, its API,
// and the entity filter ("" = every entity the user can see).
export interface Ctx {
  me: Me;
  t: MeTenant;
  api: ReturnType<typeof tenantApi>;
  entity: string;
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(!!session.get());
  const [entity, setEntity] = useState("");
  const route = useRoute();

  useEffect(() => {
    if (!session.get()) return;
    central.me().then(setMe, () => session.clear()).finally(() => setChecking(false));
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
  const ctx: Ctx | null = t ? { me, t, api: tenantApi(t.slug), entity } : null;
  const base = t ? `t/${t.slug}/` : "";

  let body;
  if (route[0] === "platform") body = <Platform me={me} />;
  else if (route[0] === "account") body = <Account me={me} />;
  else if (!ctx) body = <ErrorBox error={new Error(`You have no access to tenant "${slug}".`)} />;
  else switch (page) {
    case "stacks": body = id === "new" ? <StackNew ctx={ctx} /> : id ? <StackDetail ctx={ctx} id={id} /> : <Stacks ctx={ctx} />; break;
    case "runs": body = id ? <RunDetail ctx={ctx} id={id} /> : <Runs ctx={ctx} />; break;
    case "catalog": body = <CatalogPage ctx={ctx} />; break;
    case "environments": body = <Environments ctx={ctx} />; break;
    case "audit": body = <Audit ctx={ctx} />; break;
    case "settings": body = <TenantAdmin ctx={ctx} />; break;
    default: body = <Stacks ctx={ctx} />;
  }

  const nav: [string, string, boolean][] = t ? [
    ["stacks", "Stacks", true], ["runs", "Runs", true], ["catalog", "Module catalog", true],
    ["environments", "Environments", true], ["audit", "Audit log", true], ["settings", "Tenant settings", has(t, "tenant_admin")],
  ] : [];

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand"><img src="/favicon.svg" alt="" /> Cloud Pravaha</div>
        {me.tenants.length > 0 && (
          <div className="switcher">
            <label htmlFor="tenant-pick">Tenant</label>
            <select id="tenant-pick" value={slug} onChange={e => { setEntity(""); go(`t/${e.target.value}/stacks`); }}>
              {!t && <option value="">Choose…</option>}
              {me.tenants.map(x => <option key={x.slug} value={x.slug}>{x.name}</option>)}
            </select>
            {t && (
              <>
                <label htmlFor="entity-pick">Business unit</label>
                <select id="entity-pick" value={entity} onChange={e => setEntity(e.target.value)}>
                  <option value="">All I can see</option>
                  {t.entities.map(e => <option key={e.slug} value={e.slug}>{e.name}</option>)}
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
          {t && <div className="muted small">{[...(t.platform_admin ? ["platform admin"] : []), ...t.tenant_roles, ...t.entities.filter(e => e.roles.length).map(e => `${e.roles.join("/")} @ ${e.slug}`)].join(", ") || "no roles"}</div>}
          <button className="ghost small" style={{ marginTop: 8 }} onClick={() => { session.clear(); setMe(null); }}>Sign out</button>
        </div>
      </nav>
      <main>{body}</main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (m: Me) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    session.set(token.trim());
    try { onLogin(await central.me()); } catch (err) { session.clear(); setError(err); }
  };
  return (
    <div className="login panel">
      <div className="brand"><img src="/favicon.svg" alt="" /> Cloud Pravaha</div>
      <p className="muted">OpenTofu orchestration for every tenant and business unit, with pinned public modules only. Sign in with an API token from your tenant admin.</p>
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
