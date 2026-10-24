import { useEffect, useState } from "react";
import { central, has, type Environment } from "../../api";
import { Empty, ErrorBox, Loading, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const slugRe = /^[a-z][a-z0-9-]{1,31}$/;

// Pick a product (entity), then see its business units and its environments.
// Environments belong to the product and every business unit of it can deploy
// to every one of them.
export default function Organisation({ ctx }: SectionProps) {
  const slug = ctx.t.slug;
  const admin = has(ctx.t, "tenant_admin");
  const entities = useLoad(() => central.entities(slug), [slug]);
  const bus = useLoad(() => central.bus(slug), [slug]);
  const envs = useLoad(ctx.api.environments, [slug]);
  const contracts = useLoad(() => (admin ? ctx.api.contracts() : Promise.resolve(null)), [slug]);
  const entityAdmin = (e: string) => admin || (ctx.t.entities.find(x => x.slug === e)?.roles ?? []).includes("admin");
  const [entity, setEntity] = useState("");
  const [adding, setAdding] = useState<"" | "entity" | "bu" | "env">("");
  const [error, setError] = useState<unknown>(null);

  const ents = (entities.data ?? []).filter(e => admin || entityAdmin(e.slug));
  useEffect(() => { if (!ents.some(e => e.slug === entity) && ents.length) setEntity(ents[0].slug); }, [ents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entities.data || !bus.data || !envs.data) return entities.error || bus.error || envs.error ? <ErrorBox error={entities.error || bus.error || envs.error} /> : <Loading />;
  const units = bus.data.filter(b => b.entity === entity);
  const productEnvs = envs.data.filter(e => e.entity === entity);
  const current = entities.data.find(e => e.slug === entity);
  const folder = contracts.data?.config?.path || "stacks";
  const nested = contracts.data?.config?.layout === "nested";
  const taken = [...entities.data.map(e => e.slug), ...bus.data.map(b => b.slug)];
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); setAdding(""); } catch (e) { setError(e); } };

  return (
    <>
      <ErrorBox error={error} />
      <div className="drill">
        <section className="panel">
          <div className="drill-head"><h2>Products <span className="muted small">(entities)</span></h2>
            {admin && <button className="small" onClick={() => setAdding(adding === "entity" ? "" : "entity")}>+ New</button>}</div>
          {adding === "entity" && <NewItem what="product" taken={taken} onCancel={() => setAdding("")}
            onSave={(s, n) => run(async () => { await central.createEntity(slug, s, n); await entities.reload(); setEntity(s); })} />}
          {ents.length === 0 ? <Empty>No products yet.</Empty> : (
            <ul className="picklist">{ents.map(e => (
              <li key={e.id}><button className={e.slug === entity ? "on" : ""} onClick={() => { setEntity(e.slug); setAdding(""); }}>
                <span>{e.name}</span><span className="muted small">{bus.data!.filter(b => b.entity === e.slug).length} BUs · {envs.data!.filter(x => x.entity === e.slug).length} envs</span></button></li>))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="drill-head"><h2>Business units</h2>
            {admin && entity && <button className="small" onClick={() => setAdding(adding === "bu" ? "" : "bu")}>+ New</button>}</div>
          {adding === "bu" && <NewItem what="business unit" taken={taken} onCancel={() => setAdding("")}
            onSave={(s, n) => run(async () => { await central.createBU(slug, s, n, entity); await bus.reload(); })} />}
          {!entity ? <Empty>Choose a product.</Empty> : units.length === 0 ? <Empty>No business units in {current?.name} yet.</Empty> : (
            <ul className="plainlist">{units.map(b => <li key={b.id}><span>{b.name}</span> <span className="tag">{b.slug}</span></li>)}</ul>
          )}
          {units.length > 0 && productEnvs.length > 0 && <p className="muted small">Each can deploy to all {productEnvs.length} of {current?.name}’s environments.</p>}
        </section>

        <section className="panel">
          <div className="drill-head"><h2>Environments</h2>
            {entity && entityAdmin(entity) && <button className="small" onClick={() => setAdding(adding === "env" ? "" : "env")}>+ New</button>}</div>
          {entity && <p className="muted small" style={{ marginTop: 0 }}>Shared by every business unit of {current?.name}. Names are unique within the product.</p>}
          {!entity ? <Empty>Choose a product.</Empty> : (
            <>
              {adding === "env" && <NewEnvironment ctx={ctx} entity={entity} taken={productEnvs.map(e => e.name)} onCancel={() => setAdding("")}
                onSave={body => run(async () => { await ctx.api.createEnvironment(body); await envs.reload(); })} />}
              {productEnvs.length === 0 ? <Empty>No environments yet: {current?.name}’s stacks need at least one.</Empty> : productEnvs.map(e => (
                <EnvCard key={e.id} env={e} tenant={slug} units={units.map(u => u.slug)} canEdit={entityAdmin(entity)}
                  folder={nested ? `${folder}/${entity}/${e.name}/<bu>/<stack>.json` : `${folder}/<stack>.json with "bu" and "environment": "${e.name}"`}
                  onDelete={() => run(async () => { await ctx.api.deleteEnvironment(e.id); await envs.reload(); })} />
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

function NewEnvironment({ ctx, entity, taken, onSave, onCancel }: { ctx: SectionProps["ctx"]; entity: string; taken: string[]; onSave: (b: object) => void; onCancel: () => void }) {
  const conns = useLoad(ctx.api.connections, [ctx.t.slug]);
  const [f, setF] = useState({ name: "", tier: "nonprod", connection: "", runner_pool: "default", max_destroys: 0, max_creates: 0, max_imports: 0, allow_destroy: false });
  const usable = (conns.data ?? []).filter(c => c.entities.length === 0 || c.entities.includes(entity));
  const problem = !f.name ? "" : !slugRe.test(f.name) ? "lowercase letters, digits and dashes, e.g. dev, staging, prod" : taken.includes(f.name) ? "this product already has an environment with that name" : "";
  return (
    <div className="inline-form">
      <div className="grid">
        <div><label>Name</label><input autoFocus className="mono" placeholder="dev, staging, prod" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div><label>Tier</label><select value={f.tier} onChange={e => setF({ ...f, tier: e.target.value, allow_destroy: e.target.value === "prod" ? false : f.allow_destroy })}><option value="nonprod">nonprod</option><option value="prod">prod (raises risk)</option></select></div>
        <div><label>Cloud connection</label><select value={f.connection} onChange={e => setF({ ...f, connection: e.target.value })}>
          <option value="">None (modules that need no cloud)</option>{usable.map(c => <option key={c.id} value={c.name}>{c.name} ({c.cloud.provider})</option>)}</select></div>
        <div><label>Runner pool</label><input value={f.runner_pool} onChange={e => setF({ ...f, runner_pool: e.target.value })} /></div>
        <div><label>Max deletions per run</label><input type="number" min={0} value={f.max_destroys} onChange={e => setF({ ...f, max_destroys: Number(e.target.value) })} /></div>
        <div><label>Max creates per run <span className="muted">(0 = no limit)</span></label><input type="number" min={0} value={f.max_creates} onChange={e => setF({ ...f, max_creates: Number(e.target.value) })} /></div>
        <div><label>Max imports per run <span className="muted">(0 = no limit)</span></label><input type="number" min={0} value={f.max_imports} onChange={e => setF({ ...f, max_imports: Number(e.target.value) })} /></div>
        <div><label>Destroy runs</label><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" checked={f.allow_destroy} onChange={e => setF({ ...f, allow_destroy: e.target.checked })} /> allow</label></div>
      </div>
      {problem && <div className="small del">{problem}</div>}
      <div className="row"><button className="small" disabled={!f.name || !!problem} onClick={() => onSave({ ...f, entity })}>Create environment</button>
        <button className="ghost small" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function EnvCard({ env, folder, tenant, units, canEdit, onDelete }: { env: Environment; folder: string; tenant: string; units: string[]; canEdit: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const labels = { "pravaha-tenant": tenant, "pravaha-entity": env.entity, "pravaha-environment": env.name, "pravaha-bu": "<stack's BU>", "pravaha-stack": "<stack>", "managed-by": "cloud-pravaha" };
  return (
    <div className="card env-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}><strong>{env.name}</strong></button>
        <span>{env.tier === "prod" ? <span className="badge wait">prod</span> : <span className="badge idle">nonprod</span>} <span className="small muted">{env.connection || "no cloud"}</span></span>
      </div>
      {open && (
        <>
          <dl className="kv small">
            <dt>Used by</dt><dd>{units.length ? units.map(u => <span key={u} className="tag">{u}</span>) : <span className="muted">no business units yet</span>}</dd>
            <dt>Runner pool</dt><dd><span className="tag">{env.runner_pool}</span></dd>
            <dt>Guardrails per run</dt><dd>creates {env.max_creates || "unlimited"} · imports {env.max_imports || "unlimited"} · deletions {env.max_destroys} · destroy runs {env.allow_destroy ? "allowed" : "blocked"}</dd>
            <dt>Contracts</dt><dd className="mono small">{folder}</dd>
            <dt>Resource labels</dt><dd>{Object.entries(labels).map(([k, v]) => <span key={k} className="tag">{k}={v}</span>)}</dd>
          </dl>
          {canEdit && <button className="danger small" onClick={() => { if (window.confirm(`Delete environment ${env.name}? Only possible when no stack uses it.`)) onDelete(); }}>Delete</button>}
        </>
      )}
    </div>
  );
}
