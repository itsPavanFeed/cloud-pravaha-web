import { useState } from "react";
import type { Ctx } from "../App";
import { has } from "../api";
import { Copy, ErrorBox, Loading, useLoad } from "../ui";

const templates: Record<string, object> = {
  aws: { provider: "aws", auth: "oidc", aws: { region: "eu-west-1", role_arn: "arn:aws:iam::123456789012:role/cloud-pravaha-deployer" } },
  gcp: { provider: "gcp", auth: "oidc", gcp: { project_id: "my-project-id", region: "europe-west1", service_account_email: "deployer@my-project-id.iam.gserviceaccount.com", workload_identity_provider: "projects/123456789012/locations/global/workloadIdentityPools/cloud-pravaha/providers/cloud-pravaha" } },
  azure: { provider: "azure", auth: "oidc", azure: { tenant_id: "00000000-0000-0000-0000-000000000000", subscription_id: "00000000-0000-0000-0000-000000000000", client_id: "00000000-0000-0000-0000-000000000000" } },
};

export default function Connections({ ctx }: { ctx: Ctx }) {
  const { data, error, reload } = useLoad(ctx.api.connections, [ctx.t.slug]);
  const [open, setOpen] = useState("");
  const detail = useLoad(() => (open ? ctx.api.connection(open) : Promise.resolve(null)), [ctx.t.slug, open]);
  const admin = has(ctx.t, "tenant_admin");
  const [f, setF] = useState({ name: "", cloud: JSON.stringify(templates.aws, null, 2), entities: [] as string[] });
  const [err, setErr] = useState<unknown>(null);
  const create = async () => {
    setErr(null);
    try { await ctx.api.createConnection({ name: f.name, cloud: JSON.parse(f.cloud), entities: f.entities }); setF({ ...f, name: "" }); reload(); } catch (e) { setErr(e); }
  };

  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head"><div><h1>Cloud connections</h1>
        <div className="muted">{ctx.t.name}'s AWS accounts, GCP projects and Azure subscriptions, registered once and shared by the entities allowed to use them. They hold identifiers only: runs get short-lived credentials through OIDC workload identity.</div></div></div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Connection</th><th>Cloud</th><th>Auth</th><th>Identifiers</th><th>Available to</th></tr></thead>
          <tbody>{data.map(c => {
            const ids = (c.cloud[c.cloud.provider] ?? {}) as Record<string, string>;
            return (
              <tr key={c.id}>
                <td><a href="#" onClick={ev => { ev.preventDefault(); setOpen(open === c.id ? "" : c.id); }}><strong>{c.name}</strong></a></td>
                <td>{c.cloud.provider}</td><td>{c.cloud.auth}</td>
                <td className="mono small">{Object.values(ids).slice(0, 2).join(" · ")}</td>
                <td>{c.entities.length ? c.entities.map(e => <span key={e} className="tag">{e}</span>) : <span className="muted">every entity</span>}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>

      {open && detail.data && (
        <div className="panel">
          <h2>{detail.data.connection.name}</h2>
          <pre className="code">{JSON.stringify(detail.data.connection.cloud, null, 2)}</pre>
          {detail.data.oidc && (
            <>
              <h3>Trust this issuer in the cloud account</h3>
              <p className="muted small">The issuer is {ctx.t.name}'s own backend, not the central plane, so only this tenant's runs can obtain these credentials.</p>
              <dl className="kv">
                <dt>Issuer URL</dt><dd className="mono">{detail.data.oidc.issuer} <Copy text={detail.data.oidc.issuer} /></dd>
                <dt>Audience</dt><dd className="mono">{detail.data.oidc.audience} <Copy text={detail.data.oidc.audience} /></dd>
                <dt>Subject</dt><dd className="mono">pravaha:env:ENV:stack:STACK:phase:PHASE<div className="muted small">Scope the trust policy to the environments and stacks this account may serve (PHASE is plan or apply).</div></dd>
              </dl>
            </>
          )}
        </div>
      )}

      {admin && (
        <div className="panel">
          <h2>Register a connection</h2>
          <div className="grid">
            <div><label>Name</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="aws-prod-account" /></div>
            <div><label>Available to</label>
              <div className="row">{ctx.t.entities.map(e => (
                <label key={e.slug} className="row small" style={{ margin: 0, fontWeight: 400 }}>
                  <input type="checkbox" checked={f.entities.includes(e.slug)} onChange={ev => setF({ ...f, entities: ev.target.checked ? [...f.entities, e.slug] : f.entities.filter(x => x !== e.slug) })} /> {e.name}
                </label>))}
                {f.entities.length === 0 && <span className="muted small">none ticked = every entity</span>}</div>
            </div>
          </div>
          <label>Cloud <span className="muted">— template:</span> {Object.keys(templates).map(k => <button key={k} type="button" className="ghost small" style={{ marginLeft: 6 }} onClick={() => setF({ ...f, cloud: JSON.stringify(templates[k], null, 2) })}>{k}</button>)}</label>
          <textarea style={{ minHeight: 170 }} value={f.cloud} onChange={e => setF({ ...f, cloud: e.target.value })} spellCheck={false} />
          <ErrorBox error={err} />
          <div className="row" style={{ marginTop: 10 }}><button disabled={!f.name} onClick={create}>Register connection</button></div>
        </div>
      )}
    </>
  );
}
