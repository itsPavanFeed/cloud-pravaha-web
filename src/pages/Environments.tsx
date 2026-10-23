import { useState } from "react";
import type { Ctx } from "../App";
import { entityRoles, has } from "../api";
import { Copy, ErrorBox, Loading, useLoad } from "../ui";

const templates: Record<string, object> = {
  none: { provider: "none" },
  aws: { provider: "aws", auth: "oidc", aws: { region: "eu-west-1", role_arn: "arn:aws:iam::123456789012:role/cloud-pravaha-deployer" } },
  gcp: { provider: "gcp", auth: "oidc", gcp: { project_id: "my-project-id", region: "europe-west1", service_account_email: "deployer@my-project-id.iam.gserviceaccount.com", workload_identity_provider: "projects/123456789012/locations/global/workloadIdentityPools/cloud-pravaha/providers/cloud-pravaha" } },
  azure: { provider: "azure", auth: "oidc", azure: { tenant_id: "00000000-0000-0000-0000-000000000000", subscription_id: "00000000-0000-0000-0000-000000000000", client_id: "00000000-0000-0000-0000-000000000000" } },
};

export default function Environments({ ctx }: { ctx: Ctx }) {
  const { data, error, reload } = useLoad(ctx.api.environments, [ctx.t.slug]);
  const [open, setOpen] = useState<string>("");
  const detail = useLoad(() => (open ? ctx.api.environment(open) : Promise.resolve(null)), [ctx.t.slug, open]);
  const manageable = ctx.t.entities.filter(e => has(ctx.t, "tenant_admin") || entityRoles(ctx.t, e.slug).includes("admin"));
  const [form, setForm] = useState({ name: "", entity: "", tier: "nonprod", runner_pool: "default", max_destroys: 0, allow_destroy: false, cloud: JSON.stringify(templates.aws, null, 2) });
  const [createError, setCreateError] = useState<unknown>(null);
  const rows = (data ?? []).filter(e => !ctx.entity || e.entity === ctx.entity);

  const create = async () => {
    setCreateError(null);
    try {
      await ctx.api.createEnvironment({ ...form, entity: form.entity || manageable[0]?.slug, cloud: JSON.parse(form.cloud) });
      setForm({ ...form, name: "" }); reload();
    } catch (e) { setCreateError(e); }
  };

  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head"><div><h1>Environments</h1>
        <div className="muted">Each business unit's cloud integrations. They hold identifiers only: runs get short-lived credentials through OIDC workload identity, and no keys are stored.</div></div></div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Business unit</th><th>Tier</th><th>Cloud</th><th>Auth</th><th>Runner pool</th><th>Deletes per run</th><th>Destroy runs</th></tr></thead>
          <tbody>{rows.map(e => (
            <tr key={e.id}>
              <td><a href="#" onClick={ev => { ev.preventDefault(); setOpen(open === e.id ? "" : e.id); }}><strong>{e.name}</strong></a></td>
              <td><span className="tag">{e.entity}</span></td>
              <td>{e.tier === "prod" ? <span className="badge wait">prod</span> : <span className="badge idle">nonprod</span>}</td>
              <td>{e.cloud.provider}</td><td>{e.cloud.auth ?? "—"}</td><td><span className="tag">{e.runner_pool}</span></td>
              <td>{e.max_destroys}</td><td>{e.allow_destroy ? "allowed" : <span className="muted">blocked</span>}</td>
            </tr>))}
          </tbody>
        </table>
      </div>

      {open && detail.data && (
        <div className="panel">
          <h2>{detail.data.environment.name}</h2>
          <pre className="code">{JSON.stringify(detail.data.environment.cloud, null, 2)}</pre>
          {detail.data.oidc && (
            <>
              <h3>Trust this issuer in your cloud</h3>
              <p className="muted small">The issuer is this tenant's own backend, not the central plane: only {ctx.t.name}'s runs can obtain these credentials.</p>
              <dl className="kv">
                <dt>Issuer URL</dt><dd className="mono">{detail.data.oidc.issuer} <Copy text={detail.data.oidc.issuer} /></dd>
                <dt>Audience</dt><dd className="mono">{detail.data.oidc.audience} <Copy text={detail.data.oidc.audience} /></dd>
                <dt>Subject</dt><dd className="mono">{detail.data.oidc.subject_pattern}<div className="muted small">Each run's token subject is pravaha:env:ENV:stack:STACK:phase:PHASE (plan or apply). Scope your trust policy to the environments and stacks this role may manage.</div></dd>
              </dl>
            </>
          )}
        </div>
      )}

      {manageable.length > 0 && (
        <div className="panel">
          <h2>Add an environment</h2>
          <div className="grid">
            <div><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="payments-prod" /></div>
            <div><label>Business unit</label><select value={form.entity || manageable[0].slug} onChange={e => setForm({ ...form, entity: e.target.value })}>{manageable.map(e => <option key={e.slug} value={e.slug}>{e.name}</option>)}</select></div>
            <div><label>Tier <span className="muted">— prod raises every run's risk</span></label><select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}><option value="nonprod">nonprod</option><option value="prod">prod</option></select></div>
            <div><label>Runner pool</label><input value={form.runner_pool} onChange={e => setForm({ ...form, runner_pool: e.target.value })} /></div>
            <div><label>Max deletions per run</label><input type="number" min={0} value={form.max_destroys} onChange={e => setForm({ ...form, max_destroys: Number(e.target.value) })} /></div>
            <div><label>Destroy runs</label><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" checked={form.allow_destroy} onChange={e => setForm({ ...form, allow_destroy: e.target.checked })} /> allow</label></div>
          </div>
          <label>Cloud integration <span className="muted">— template:</span> {Object.keys(templates).map(k => <button key={k} type="button" className="ghost small" style={{ marginLeft: 6 }} onClick={() => setForm({ ...form, cloud: JSON.stringify(templates[k], null, 2) })}>{k}</button>)}</label>
          <textarea style={{ minHeight: 170 }} value={form.cloud} onChange={e => setForm({ ...form, cloud: e.target.value })} spellCheck={false} />
          <ErrorBox error={createError} />
          <div className="row" style={{ marginTop: 10 }}><button disabled={!form.name} onClick={create}>Create environment</button></div>
        </div>
      )}
    </>
  );
}
