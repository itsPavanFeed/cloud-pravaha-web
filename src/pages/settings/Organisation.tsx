import { useEffect, useState } from "react";
import { allBUs, buRoles, central, has, type Environment } from "../../api";
import { Empty, ErrorBox, Loading, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const slugRe = /^[a-z][a-z0-9-]{1,31}$/;

// Products (entities) → business units → allowed environments, one step at a
// time. Each environment shows the labels its resources get and the folder its
// contracts live in.
export default function Organisation({ ctx }: SectionProps) {
  const slug = ctx.t.slug;
  const admin = has(ctx.t, "tenant_admin");
  const entities = useLoad(() => central.entities(slug), [slug]);
  const bus = useLoad(() => central.bus(slug), [slug]);
  const envs = useLoad(ctx.api.environments, [slug]);
  const contracts = useLoad(() => (admin ? ctx.api.contracts() : Promise.resolve(null)), [slug]);
  const manageable = (bu: string) => admin || buRoles(ctx.t, bu).includes("admin");
  // BU admins only see the units they administer.
  const myBUs = new Set(allBUs(ctx.t).filter(b => manageable(b.slug)).map(b => b.slug));
  const [entity, setEntity] = useState("");
  const [bu, setBu] = useState("");
  const [adding, setAdding] = useState<"" | "entity" | "bu" | "env">("");
  const [error, setError] = useState<unknown>(null);

  const ents = (entities.data ?? []).filter(e => admin || (bus.data ?? []).some(b => b.entity === e.slug && myBUs.has(b.slug)));
  useEffect(() => { if (!entity && ents.length) setEntity(ents[0].slug); }, [ents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const units = (bus.data ?? []).filter(b => b.entity === entity && (admin || myBUs.has(b.slug)));
  useEffect(() => { if (!units.some(u => u.slug === bu)) setBu(units[0]?.slug ?? ""); }, [entity, bus.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entities.data || !bus.data || !envs.data) return entities.error || bus.error || envs.error ? <ErrorBox error={entities.error || bus.error || envs.error} /> : <Loading />;
  const unitEnvs = envs.data.filter(e => e.bu === bu);
  const folder = contracts.data?.config?.path || "stacks";
  const nested = contracts.data?.config?.layout === "nested";
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); setAdding(""); } catch (e) { setError(e); } };

  return (
    <>
      <ErrorBox error={error} />
      <div className="drill">
        <section className="panel">
          <div className="drill-head"><h2>Products <span className="muted small">(entities)</span></h2>
            {admin && <button className="small" onClick={() => setAdding(adding === "entity" ? "" : "entity")}>+ New</button>}</div>
          {adding === "entity" && <NewItem what="product" taken={[...entities.data.map(e => e.slug), ...bus.data.map(b => b.slug)]}
            onCancel={() => setAdding("")} onSave={(s, n) => run(async () => { await central.createEntity(slug, s, n); await entities.reload(); setEntity(s); })} />}
          {ents.length === 0 ? <Empty>No products yet.</Empty> : (
            <ul className="picklist">{ents.map(e => (
              <li key={e.id}><button className={e.slug === entity ? "on" : ""} onClick={() => { setEntity(e.slug); setAdding(""); }}>
                <span>{e.name}</span><span className="muted small">{bus.data!.filter(b => b.entity === e.slug).length} units</span></button></li>))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="drill-head"><h2>Business units</h2>
            {admin && entity && <button className="small" onClick={() => setAdding(adding === "bu" ? "" : "bu")}>+ New</button>}</div>
          {adding === "bu" && <NewItem what="business unit" taken={[...entities.data.map(e => e.slug), ...bus.data.map(b => b.slug)]}
            onCancel={() => setAdding("")} onSave={(s, n) => run(async () => { await central.createBU(slug, s, n, entity); await bus.reload(); setBu(s); })} />}
          {!entity ? <Empty>Choose a product.</Empty> : units.length === 0 ? <Empty>No business units in this product yet.</Empty> : (
            <ul className="picklist">{units.map(b => (
              <li key={b.id}><button className={b.slug === bu ? "on" : ""} onClick={() => { setBu(b.slug); setAdding(""); }}>
                <span>{b.name}</span><span className="muted small">{envs.data!.filter(e => e.bu === b.slug).length} environments</span></button></li>))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="drill-head"><h2>Allowed environments</h2>
            {bu && manageable(bu) && <button className="small" onClick={() => setAdding(adding === "env" ? "" : "env")}>+ New</button>}</div>
          {!bu ? <Empty>Choose a business unit.</Empty> : (
            <>
              {adding === "env" && <NewEnvironment ctx={ctx} entity={entity} bu={bu} onCancel={() => setAdding("")}
                onSave={body => run(async () => { await ctx.api.createEnvironment(body); await envs.reload(); })} />}
              {unitEnvs.length === 0 ? <Empty>No environments yet: stacks in {bu} need at least one.</Empty> : unitEnvs.map(e => (
                <EnvCard key={e.id} env={e} folder={nested ? `${folder}/${entity}/${bu}/${e.name}/` : `${folder}/  (flat layout: "environment": "${e.name}")`}
                  tenant={slug} canEdit={manageable(bu)} onDelete={() => run(async () => { await ctx.api.deleteEnvironment(e.id); await envs.reload(); })} />
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function NewItem({ what, taken, onSave, onCancel }: { what: string; taken: string[]; onSave: (slug: string, name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [s, setS] = useState("");
  const auto = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const value = s || auto;
  const problem = !value ? "" : !slugRe.test(value) ? "lowercase letters, digits and dashes, starting with a letter" : taken.includes(value) ? "already used by a product or business unit" : "";
  return (
    <div className="inline-form">
      <input autoFocus placeholder={`${what[0].toUpperCase() + what.slice(1)} name`} value={name} onChange={e => setName(e.target.value)} />
      <input className="mono" placeholder="slug" value={value} onChange={e => setS(e.target.value)} />
      {problem && <div className="small del">{problem}</div>}
      <div className="row"><button className="small" disabled={!name || !value || !!problem} onClick={() => onSave(value, name)}>Create {what}</button>
        <button className="ghost small" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function NewEnvironment({ ctx, entity, bu, onSave, onCancel }: { ctx: SectionProps["ctx"]; entity: string; bu: string; onSave: (b: object) => void; onCancel: () => void }) {
  const conns = useLoad(ctx.api.connections, [ctx.t.slug]);
  const [f, setF] = useState({ name: `${bu}-`, tier: "nonprod", connection: "", runner_pool: "default", max_destroys: 0, allow_destroy: false });
  const usable = (conns.data ?? []).filter(c => c.entities.length === 0 || c.entities.includes(entity));
  return (
    <div className="inline-form">
      <div className="grid">
        <div><label>Name</label><input autoFocus className="mono" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Tier</label><select value={f.tier} onChange={e => setF({ ...f, tier: e.target.value, allow_destroy: e.target.value === "prod" ? false : f.allow_destroy })}><option value="nonprod">nonprod</option><option value="prod">prod (raises risk)</option></select></div>
        <div><label>Cloud connection</label><select value={f.connection} onChange={e => setF({ ...f, connection: e.target.value })}>
          <option value="">None (modules that need no cloud)</option>{usable.map(c => <option key={c.id} value={c.name}>{c.name} ({c.cloud.provider})</option>)}</select></div>
        <div><label>Runner pool</label><input value={f.runner_pool} onChange={e => setF({ ...f, runner_pool: e.target.value })} /></div>
        <div><label>Max deletions per run</label><input type="number" min={0} value={f.max_destroys} onChange={e => setF({ ...f, max_destroys: Number(e.target.value) })} /></div>
        <div><label>Destroy runs</label><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" checked={f.allow_destroy} onChange={e => setF({ ...f, allow_destroy: e.target.checked })} /> allow</label></div>
      </div>
      <div className="row"><button className="small" disabled={!slugRe.test(f.name)} onClick={() => onSave({ ...f, bu })}>Create environment</button>
        <button className="ghost small" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function EnvCard({ env, folder, tenant, canEdit, onDelete }: { env: Environment; folder: string; tenant: string; canEdit: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const labels = { "pravaha-tenant": tenant, "pravaha-entity": env.entity, "pravaha-bu": env.bu, "pravaha-environment": env.name, "pravaha-stack": "<stack>", "managed-by": "cloud-pravaha" };
  return (
    <div className="card env-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}><strong>{env.name}</strong></button>
        <span>{env.tier === "prod" ? <span className="badge wait">prod</span> : <span className="badge idle">nonprod</span>} <span className="small muted">{env.connection || "no cloud"}</span></span>
      </div>
      {open && (
        <>
          <dl className="kv small">
            <dt>Runner pool</dt><dd><span className="tag">{env.runner_pool}</span></dd>
            <dt>Guardrails</dt><dd>{env.max_destroys} deletions per run · destroy runs {env.allow_destroy ? "allowed" : "blocked"}</dd>
            <dt>Contracts folder</dt><dd className="mono small">{folder}</dd>
            <dt>Resource labels</dt><dd>{Object.entries(labels).map(([k, v]) => <span key={k} className="tag">{k}={v}</span>)}</dd>
          </dl>
          {canEdit && <button className="danger small" onClick={() => { if (window.confirm(`Delete environment ${env.name}? Only possible when it has no stacks.`)) onDelete(); }}>Delete</button>}
        </>
      )}
    </div>
  );
}
