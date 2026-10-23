import { useState } from "react";
import type { Ctx } from "../App";
import { central, type RiskSettings, type Step } from "../api";
import { Copy, ErrorBox, Loading, Time, useLoad } from "../ui";

const tenantRoles = ["tenant_admin", "finops", "security", "auditor"];
const scopedRoles = ["admin", "manager", "developer", "viewer"];

export default function TenantAdmin({ ctx }: { ctx: Ctx }) {
  const slug = ctx.t.slug;
  const health = useLoad(() => central.health(slug), [slug]);
  const entities = useLoad(() => central.entities(slug), [slug]);
  const bus = useLoad(() => central.bus(slug), [slug]);
  const [newBU, setNewBU] = useState({ slug: "", name: "", entity: "" });
  const members = useLoad(() => central.members(slug), [slug]);
  const runners = useLoad(ctx.api.runners, [slug], 10000);
  const riskCfg = useLoad(ctx.api.riskSettings, [slug]);
  const [rs, setRs] = useState<RiskSettings | null>(null);
  const cfg = rs ?? riskCfg.data;
  const [ent, setEnt] = useState({ slug: "", name: "" });
  const [m, setM] = useState({ email: "", scope: "", role: "finops" }); // scope: "" | entity:x | bu:y
  const [r, setR] = useState({ name: "", pool: "default" });
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const roles = m.scope ? scopedRoles : tenantRoles;
  const grant = () => {
    const [kind, value] = m.scope.split(":");
    return central.addMember(slug, { email: m.email, role: m.role, ...(kind === "entity" ? { entity: value } : kind === "bu" ? { bu: value } : {}) });
  };

  return (
    <>
      <div className="head"><div><h1>Tenant settings</h1><div className="muted">{ctx.t.name}: business units, people and roles, runners.</div></div>
        {health.data && (health.data.reachable ? <span className="badge ok">backend reachable over mTLS</span> : <span className="badge bad" title={health.data.error}>backend unreachable</span>)}
      </div>
      {secret && (
        <div className="notice">
          <strong>{secret.label}</strong> — copy it now; it will not be shown again.
          <div className="row" style={{ marginTop: 8 }}><div className="secret" style={{ flex: 1 }}>{secret.value}</div><Copy text={secret.value} /><button className="ghost small" onClick={() => setSecret(null)}>Done</button></div>
        </div>
      )}
      <ErrorBox error={error} />

      <div className="panel">
        <h2>Entities and business units</h2>
        <p className="muted small">An entity is a company in the tenant; each has business units (products). Roles granted on an entity apply to all its business units.</p>
        {!entities.data || !bus.data ? <Loading /> : (
          <div className="grid" style={{ marginBottom: 14 }}>
            {entities.data.map(e => (
              <div className="card" key={e.id}>
                <h3>{e.name} <span className="tag">{e.slug}</span></h3>
                {bus.data!.filter(b => b.entity === e.slug).map(b => <div key={b.id} className="small">↳ {b.name} <span className="tag">{b.slug}</span></div>)}
                {bus.data!.every(b => b.entity !== e.slug) && <div className="muted small">No business units yet.</div>}
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginBottom: 8 }}>
          <input style={{ maxWidth: 170 }} placeholder="entity slug, e.g. retail" value={ent.slug} onChange={e => setEnt({ ...ent, slug: e.target.value })} />
          <input style={{ maxWidth: 220 }} placeholder="Entity name" value={ent.name} onChange={e => setEnt({ ...ent, name: e.target.value })} />
          <button disabled={!ent.slug || !ent.name} onClick={() => run(async () => { await central.createEntity(slug, ent.slug, ent.name); setEnt({ slug: "", name: "" }); entities.reload(); })}>Add entity</button>
        </div>
        <div className="row">
          <select style={{ maxWidth: 200 }} value={newBU.entity} onChange={e => setNewBU({ ...newBU, entity: e.target.value })}>
            <option value="">Entity…</option>{(entities.data ?? []).map(e => <option key={e.slug} value={e.slug}>{e.name}</option>)}</select>
          <input style={{ maxWidth: 170 }} placeholder="BU slug, e.g. payments" value={newBU.slug} onChange={e => setNewBU({ ...newBU, slug: e.target.value })} />
          <input style={{ maxWidth: 220 }} placeholder="BU name" value={newBU.name} onChange={e => setNewBU({ ...newBU, name: e.target.value })} />
          <button disabled={!newBU.slug || !newBU.name || !newBU.entity} onClick={() => run(async () => { await central.createBU(slug, newBU.slug, newBU.name, newBU.entity); setNewBU({ slug: "", name: "", entity: newBU.entity }); bus.reload(); })}>Add business unit</button>
        </div>
      </div>

      <div className="panel">
        <h2>People and roles</h2>
        <p className="muted small">Tenant-wide roles: tenant_admin, finops and security approve across every business unit, auditor reads everything. Entity or BU roles: admin, manager (signs the manager step), developer (authors stacks and starts runs), viewer. Entity roles apply to all of its business units.</p>
        <div className="grid">
          <div><label>Email</label><input value={m.email} onChange={e => setM({ ...m, email: e.target.value })} placeholder="alice@example.com" /></div>
          <div><label>Scope</label><select value={m.scope} onChange={e => setM({ ...m, scope: e.target.value, role: e.target.value ? "developer" : "finops" })}>
            <option value="">Whole tenant</option>
            {(entities.data ?? []).map(e => (
              <optgroup key={e.slug} label={e.name}>
                <option value={`entity:${e.slug}`}>{e.name} (all its BUs)</option>
                {(bus.data ?? []).filter(b => b.entity === e.slug).map(b => <option key={b.slug} value={`bu:${b.slug}`}>{b.name}</option>)}
              </optgroup>))}
          </select></div>
          <div><label>Role</label><select value={m.role} onChange={e => setM({ ...m, role: e.target.value })}>{roles.map(x => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="row" style={{ margin: "12px 0 16px" }}>
          <button disabled={!m.email} onClick={() => run(async () => { await grant(); members.reload(); })}>Grant role</button>
        </div>
        {members.data && (
          <table>
            <thead><tr><th>Person</th><th>Scope</th><th>Role</th><th>Granted by</th><th /></tr></thead>
            <tbody>{members.data.map(x => (
              <tr key={x.id}>
                <td>{x.email}</td><td>{x.bu ? <><span className="muted small">BU</span> <span className="tag">{x.bu}</span></> : x.entity ? <><span className="muted small">entity</span> <span className="tag">{x.entity}</span></> : <span className="muted">tenant</span>}</td><td>{x.role}</td>
                <td className="small muted">{x.created_by} · <Time iso={x.created_at} /></td>
                <td className="row">
                  <button className="ghost small" onClick={() => run(async () => { const t = await central.memberToken(slug, x.email, "issued by admin", 30); setSecret({ label: `Token for ${t.user}`, value: t.secret }); })}>Issue token</button>
                  <button className="danger small" onClick={() => run(async () => { await central.removeMember(slug, x.id); members.reload(); })}>Remove</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>

      {cfg && (
        <div className="panel">
          <h2>Risk policy</h2>
          <p className="muted small">How plans are classified and which approvals each level needs. High risk always needs Security, and a higher level never needs fewer approvals.</p>
          <div className="grid">
            <div><label>Large change (resources)</label><input type="number" min={1} value={cfg.large_change} onChange={e => setRs({ ...cfg, large_change: Number(e.target.value) })} /></div>
            <div><label>Production is at least</label><select value={cfg.prod_level} onChange={e => setRs({ ...cfg, prod_level: e.target.value as "medium" | "high" })}><option value="medium">medium</option><option value="high">high</option></select></div>
            <div><label>Cost → medium ($/month, 0 = off)</label><input type="number" min={0} value={cfg.cost_medium_usd} onChange={e => setRs({ ...cfg, cost_medium_usd: Number(e.target.value) })} /></div>
            <div><label>Cost → high ($/month, 0 = off)</label><input type="number" min={0} value={cfg.cost_high_usd} onChange={e => setRs({ ...cfg, cost_high_usd: Number(e.target.value) })} /></div>
          </div>
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Risk</th>{(["manager", "finops", "security"] as Step[]).map(st => <th key={st}>{st}</th>)}</tr></thead>
            <tbody>{(["low", "medium", "high"] as const).map(level => (
              <tr key={level}><td><strong>{level}</strong></td>{(["manager", "finops", "security"] as Step[]).map(st => (
                <td key={st}><input type="checkbox" checked={cfg.approvals[level].includes(st)} onChange={e => {
                  const steps = e.target.checked ? [...cfg.approvals[level], st] : cfg.approvals[level].filter(x => x !== st);
                  const order: Step[] = ["manager", "finops", "security"];
                  setRs({ ...cfg, approvals: { ...cfg.approvals, [level]: order.filter(x => steps.includes(x)) } });
                }} /></td>))}</tr>))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={!rs} onClick={() => run(async () => { await ctx.api.putRiskSettings(cfg); setRs(null); riskCfg.reload(); })}>Save risk policy</button>
            {rs && <button className="ghost" onClick={() => setRs(null)}>Reset</button>}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Runners</h2>
        <p className="muted small">Runners execute OpenTofu next to {ctx.t.name}'s clouds and poll this tenant's backend outbound. Each serves one pool.</p>
        <div className="row" style={{ marginBottom: 16 }}>
          <input style={{ maxWidth: 200 }} placeholder="name, e.g. prod-aws-1" value={r.name} onChange={e => setR({ ...r, name: e.target.value })} />
          <input style={{ maxWidth: 160 }} placeholder="pool" value={r.pool} onChange={e => setR({ ...r, pool: e.target.value })} />
          <button disabled={!r.name} onClick={() => run(async () => { const x = await ctx.api.createRunner(r); setSecret({ label: `Runner token for ${x.runner.name} (PRAVAHA_RUNNER_TOKEN)`, value: x.secret }); runners.reload(); })}>Register runner</button>
        </div>
        {runners.data && (
          <table>
            <thead><tr><th>Runner</th><th>Pool</th><th>Last seen</th><th /></tr></thead>
            <tbody>{runners.data.map(x => (
              <tr key={x.id}><td>{x.name}</td><td><span className="tag">{x.pool}</span></td><td><Time iso={x.last_seen_at} /></td>
                <td>{x.revoked_at ? <span className="badge idle">revoked</span> : <button className="danger small" onClick={() => run(async () => { await ctx.api.revokeRunner(x.id); runners.reload(); })}>Revoke</button>}</td></tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
