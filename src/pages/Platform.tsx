import { useState } from "react";
import { central, type Me } from "../api";
import { ErrorBox, Loading, Time, useLoad } from "../ui";

export default function Platform({ me }: { me: Me }) {
  const tenants = useLoad(central.tenants);
  const [f, setF] = useState({ slug: "", name: "", backend_url: "https://", server_ca_pem: "", admin_email: "" });
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [health, setHealth] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  if (!me.user.platform_admin) return <ErrorBox error={new Error("This page is for platform admins.")} />;

  const onboard = async () => {
    setError(null); setResult(null);
    try { const r = await central.onboard(f); setResult(r.tenant_plane_settings); tenants.reload(); } catch (e) { setError(e); }
  };
  const check = async (slug: string) => {
    try { const h = await central.health(slug); setHealth({ ...health, [slug]: h.reachable ? "reachable" : `unreachable: ${h.error ?? ""}` }); }
    catch (e) { setHealth({ ...health, [slug]: String(e) }); }
  };

  return (
    <>
      <div className="head"><div><h1>Platform</h1><div className="muted">Onboard tenants. Each tenant runs its own backend, database and runners; this central plane routes to it. As a platform admin you hold tenant-admin powers in every tenant, see every business unit and can author stacks and runs; signing approvals still needs an explicit manager, FinOps or Security role. Your actions are audited as platform-admin.</div></div></div>
      <div className="panel" style={{ padding: 0 }}>
        {!tenants.data ? <Loading /> : (
          <table>
            <thead><tr><th>Tenant</th><th>Backend</th><th>Onboarded</th><th>Health</th></tr></thead>
            <tbody>{tenants.data.map(t => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong> <span className="tag">{t.slug}</span></td>
                <td className="mono small">{t.backend_url}</td>
                <td className="small">{t.created_by} · <Time iso={t.created_at} /></td>
                <td>{health[t.slug] ? <span className="small">{health[t.slug]}</span> : <button className="ghost small" onClick={() => check(t.slug)}>Check</button>}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Onboard a tenant</h2>
        <div className="grid">
          <div><label>Slug</label><input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} placeholder="acme" /></div>
          <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Acme Corp" /></div>
          <div><label>Tenant backend URL</label><input value={f.backend_url} onChange={e => setF({ ...f, backend_url: e.target.value })} placeholder="https://pravaha.acme.internal" /></div>
          <div><label>First tenant admin</label><input value={f.admin_email} onChange={e => setF({ ...f, admin_email: e.target.value })} placeholder="admin@acme.com" /></div>
        </div>
        <label>Backend TLS CA <span className="muted">(PEM; leave empty if the backend has a publicly trusted certificate)</span></label>
        <textarea value={f.server_ca_pem} onChange={e => setF({ ...f, server_ca_pem: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" spellCheck={false} />
        <ErrorBox error={error} />
        <div className="row" style={{ marginTop: 10 }}><button disabled={!f.slug || !f.name || !f.admin_email} onClick={onboard}>Onboard tenant</button></div>
        {result && (
          <div className="success">
            <strong>Tenant onboarded.</strong> Start its backend with these settings, then issue the admin a token from the tenant's settings.
            <pre className="code small" style={{ marginTop: 8 }}>{Object.entries(result).map(([k, v]) => k === "note" ? `# ${v}` : `${k}=${v}`).join("\n")}</pre>
          </div>
        )}
      </div>
    </>
  );
}
