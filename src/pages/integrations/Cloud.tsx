import { useState } from "react";
import type { Ctx } from "../../App";
import { has } from "../../api";
import { Copy, Empty, ErrorBox, Loading, Pager, useLoad } from "../../ui";

type Provider = "" | "aws" | "gcp" | "azure";
const PAGE = 10;
const label: Record<string, string> = { "": "All", aws: "AWS", gcp: "GCP", azure: "Azure" };

const templates: Record<string, object> = {
  aws: { provider: "aws", auth: "oidc", aws: { region: "eu-west-1", role_arn: "arn:aws:iam::123456789012:role/cloud-pravaha-deployer" } },
  gcp: { provider: "gcp", auth: "oidc", gcp: { project_id: "my-project-id", region: "europe-west1", service_account_email: "deployer@my-project-id.iam.gserviceaccount.com", workload_identity_provider: "projects/123456789012/locations/global/workloadIdentityPools/cloud-pravaha/providers/cloud-pravaha" } },
  azure: { provider: "azure", auth: "oidc", azure: { tenant_id: "00000000-0000-0000-0000-000000000000", subscription_id: "00000000-0000-0000-0000-000000000000", client_id: "00000000-0000-0000-0000-000000000000" } },
};

// The Cloud tab: the tenant's AWS, GCP and Azure connections, filtered by
// provider and paged on the server. Details load when a row is opened.
export default function CloudIntegrations({ ctx, provider, setProvider }: { ctx: Ctx; provider: Provider; setProvider: (p: Provider) => void }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState("");
  const page = useLoad(() => ctx.api.connectionsPage(provider, PAGE, offset), [ctx.t.slug, provider, offset]);
  const admin = has(ctx.t, "tenant_admin");
  const [showForm, setShowForm] = useState(false);
  const pick = (p: Provider) => { setProvider(p); setOffset(0); setOpen(""); };
  const counts = page.data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0 }}>Cloud connections</h2>
            <div className="muted small">{ctx.t.name}’s accounts, projects and subscriptions. They hold identifiers only: runs get short-lived credentials through OIDC workload identity.</div></div>
        </div>
        <div className="chips" role="tablist" aria-label="Cloud provider">
          {(["", "aws", "gcp", "azure"] as Provider[]).map(p => (
            <button key={p || "all"} role="tab" aria-selected={provider === p} className={provider === p ? "chip on" : "chip"} onClick={() => pick(p)}>
              {label[p]} <span className="count">{p ? counts[p] ?? 0 : all}</span>
            </button>
          ))}
        </div>
        {!page.data ? (page.error ? <ErrorBox error={page.error} /> : <Loading />) : page.data.items.length === 0 ? (
          <Empty>No {provider ? label[provider] + " " : ""}connections yet.{admin ? " Register one below." : ""}</Empty>
        ) : (
          <>
            <table>
              <thead><tr><th>Connection</th><th>Cloud</th><th>Auth</th><th>Identifiers</th><th>Available to</th></tr></thead>
              <tbody>{page.data.items.map(c => {
                const ids = (c.cloud[c.cloud.provider] ?? {}) as Record<string, string>;
                return (
                  <tr key={c.id} className={open === c.id ? "selected" : ""}>
                    <td><button className="linklike" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? "" : c.id)}><strong>{c.name}</strong></button></td>
                    <td>{label[c.cloud.provider] ?? c.cloud.provider}</td><td>{c.cloud.auth}</td>
                    <td className="mono small">{Object.values(ids).slice(0, 2).join(" · ")}</td>
                    <td>{c.entities.length ? c.entities.map(e => <span key={e} className="tag">{e}</span>) : <span className="muted">every entity</span>}</td>
                  </tr>);
              })}</tbody>
            </table>
            <Pager offset={offset} limit={PAGE} total={page.data.total} onPage={o => { setOffset(o); setOpen(""); }} />
          </>
        )}
      </div>

      {open && <ConnectionDetail ctx={ctx} id={open} />}

      {admin && (
        <details className="panel section" onToggle={e => setShowForm((e.target as HTMLDetailsElement).open)}>
          <summary><h2>Register a connection</h2></summary>
          {showForm && <RegisterForm ctx={ctx} initial={provider || "aws"} onDone={() => { setOffset(0); page.reload(); }} />}
        </details>
      )}
    </>
  );
}

function ConnectionDetail({ ctx, id }: { ctx: Ctx; id: string }) {
  const d = useLoad(() => ctx.api.connection(id), [ctx.t.slug, id]);
  if (!d.data) return d.error ? <ErrorBox error={d.error} /> : <div className="panel"><Loading /></div>;
  const { connection: c, oidc } = d.data;
  return (
    <div className="panel">
      <h2>{c.name}</h2>
      <pre className="code">{JSON.stringify(c.cloud, null, 2)}</pre>
      {oidc && (
        <>
          <h3>Trust this issuer in the cloud account</h3>
          <p className="muted small">The issuer is {ctx.t.name}’s own backend, not the central plane, so only this tenant’s runs can obtain these credentials.</p>
          <dl className="kv">
            <dt>Issuer URL</dt><dd className="mono">{oidc.issuer} <Copy text={oidc.issuer} /></dd>
            <dt>Audience</dt><dd className="mono">{oidc.audience} <Copy text={oidc.audience} /></dd>
            <dt>Subject</dt><dd className="mono">pravaha:env:ENV:stack:STACK:phase:PHASE<div className="muted small">Scope the trust policy to the environments and stacks this account may serve (PHASE is plan or apply).</div></dd>
          </dl>
        </>
      )}
    </div>
  );
}

function RegisterForm({ ctx, initial, onDone }: { ctx: Ctx; initial: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", cloud: JSON.stringify(templates[initial], null, 2), entities: [] as string[] });
  const [err, setErr] = useState<unknown>(null);
  const create = async () => {
    setErr(null);
    try { await ctx.api.createConnection({ name: f.name, cloud: JSON.parse(f.cloud), entities: f.entities }); setF({ ...f, name: "" }); onDone(); } catch (e) { setErr(e); }
  };
  return (
    <>
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
      <label>Cloud <span className="muted">— template:</span> {Object.keys(templates).map(k => <button key={k} type="button" className="ghost small" style={{ marginLeft: 6 }} onClick={() => setF({ ...f, cloud: JSON.stringify(templates[k], null, 2) })}>{label[k]}</button>)}</label>
      <textarea style={{ minHeight: 170 }} value={f.cloud} onChange={e => setF({ ...f, cloud: e.target.value })} spellCheck={false} />
      <ErrorBox error={err} />
      <div className="row" style={{ marginTop: 10 }}><button disabled={!f.name} onClick={create}>Register connection</button></div>
    </>
  );
}
