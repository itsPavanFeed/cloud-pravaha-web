import { useState } from "react";
import { inScope, type Ctx } from "../App";
import { allBUs, buRoles, has } from "../api";
import { ErrorBox, Link, Loading, useLoad } from "../ui";

export default function Environments({ ctx }: { ctx: Ctx }) {
  const { data, error, reload } = useLoad(ctx.api.environments, [ctx.t.slug]);
  const conns = useLoad(ctx.api.connections, [ctx.t.slug]);
  const manageable = allBUs(ctx.t).filter(b => has(ctx.t, "tenant_admin") || buRoles(ctx.t, b.slug).includes("admin"));
  const [form, setForm] = useState({ name: "", bu: "", tier: "nonprod", connection: "", runner_pool: "default", max_destroys: 0, allow_destroy: false });
  const [createError, setCreateError] = useState<unknown>(null);
  const rows = (data ?? []).filter(e => inScope(ctx, e.bu, e.entity));
  const bu = form.bu || manageable[0]?.slug || "";
  const buEntity = manageable.find(b => b.slug === bu)?.entity ?? "";
  const usable = (conns.data ?? []).filter(c => c.entities.length === 0 || c.entities.includes(buEntity));

  const create = async () => {
    setCreateError(null);
    try { await ctx.api.createEnvironment({ ...form, bu }); setForm({ ...form, name: "" }); reload(); } catch (e) { setCreateError(e); }
  };

  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head"><div><h1>Environments</h1>
        <div className="muted">Where a business unit deploys: a cloud connection (or none), a tier, a runner pool and guardrails. Production tiers raise every run's risk.</div></div></div>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Entity / BU</th><th>Tier</th><th>Cloud connection</th><th>Runner pool</th><th>Deletes per run</th><th>Destroy runs</th></tr></thead>
          <tbody>{rows.map(e => (
            <tr key={e.id}>
              <td><strong>{e.name}</strong></td>
              <td><span className="muted small">{e.entity} /</span> <span className="tag">{e.bu}</span></td>
              <td>{e.tier === "prod" ? <span className="badge wait">prod</span> : <span className="badge idle">nonprod</span>}</td>
              <td>{e.connection ? <Link to={`t/${ctx.t.slug}/connections`}>{e.connection}</Link> : <span className="muted">none</span>} <span className="muted small">{e.cloud.provider !== "none" && e.cloud.provider}</span></td>
              <td><span className="tag">{e.runner_pool}</span></td>
              <td>{e.max_destroys}</td><td>{e.allow_destroy ? "allowed" : <span className="muted">blocked</span>}</td>
            </tr>))}
          </tbody>
        </table>
      </div>

      {manageable.length > 0 && (
        <div className="panel">
          <h2>Add an environment</h2>
          <div className="grid">
            <div><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="payments-prod" /></div>
            <div><label>Business unit</label><select value={bu} onChange={e => setForm({ ...form, bu: e.target.value, connection: "" })}>{manageable.map(b => <option key={b.slug} value={b.slug}>{b.entityName} / {b.name}</option>)}</select></div>
            <div><label>Cloud connection <span className="muted">— available to {buEntity}</span></label><select value={form.connection} onChange={e => setForm({ ...form, connection: e.target.value })}>
              <option value="">None (modules that need no cloud)</option>{usable.map(c => <option key={c.id} value={c.name}>{c.name} ({c.cloud.provider})</option>)}</select></div>
            <div><label>Tier</label><select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}><option value="nonprod">nonprod</option><option value="prod">prod</option></select></div>
            <div><label>Runner pool</label><input value={form.runner_pool} onChange={e => setForm({ ...form, runner_pool: e.target.value })} /></div>
            <div><label>Max deletions per run</label><input type="number" min={0} value={form.max_destroys} onChange={e => setForm({ ...form, max_destroys: Number(e.target.value) })} /></div>
            <div><label>Destroy runs</label><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" checked={form.allow_destroy} onChange={e => setForm({ ...form, allow_destroy: e.target.checked })} /> allow</label></div>
          </div>
          <ErrorBox error={createError} />
          <div className="row" style={{ marginTop: 10 }}><button disabled={!form.name} onClick={create}>Create environment</button></div>
        </div>
      )}
    </>
  );
}
