import { useEffect, useMemo, useState } from "react";
import { inScope, type Ctx } from "../App";
import { allBUs, canChange, type CatalogInput, type CatalogModule, type KindDefaults, type StackSpec } from "../api";
import { ErrorBox, Loading, go, useLoad } from "../ui";

// Raw form values per resource; converted to typed inputs on submit. Fields
// start empty: a stack keeps only what differs from the defaults (the kind's,
// then the tenant's), so later changes to the defaults still apply to it.
type Field = { mode: "value" | "ref" | "secret"; text: string; ref: string; secret: string };
type Instance = { key: number; name: string; module: string; version: string; fields: Record<string, Field>; outputs: string[] };

const blank = (inp: CatalogInput): Field => ({ mode: inp.sensitive ? "secret" : "value", text: "", ref: "", secret: "" });

const show = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));

// effectiveDefault is what applies when a field is left empty, and where it comes from.
function effectiveDefault(inp: CatalogInput, d: KindDefaults | undefined, tier: string): { value: unknown; from: string } | null {
  const tierVal = d?.tiers?.[tier]?.[inp.name];
  if (tierVal !== undefined) return { value: tierVal, from: `tenant default (${tier})` };
  if (d?.spec?.[inp.name] !== undefined) return { value: d.spec[inp.name], from: "tenant default" };
  if (inp.default !== undefined) return { value: inp.default, from: "kind default" };
  return null;
}

function convert(inp: CatalogInput, f: Field): { set: boolean; value?: unknown; error?: string } {
  if (f.mode === "ref") return f.ref ? { set: true, value: { $ref: f.ref } } : { set: false };
  if (f.mode === "secret") {
    const s = f.secret.trim();
    if (!s) return { set: false };
    return /^vault:\/\/[^/]+\/.+#.+$/.test(s) ? { set: true, value: { $secret: s } } : { set: false, error: `${inp.name} must be a secret reference like vault://kv/app/db#password` };
  }
  const t = f.text.trim();
  switch (inp.type) {
    case "bool": return t === "" ? { set: false } : { set: true, value: t === "true" };
    case "number": return t === "" ? { set: false } : isNaN(Number(t)) ? { set: false, error: `${inp.name} must be a number` } : { set: true, value: Number(t) };
    case "list(string)": return t === "" ? { set: false } : { set: true, value: t.split(",").map(s => s.trim()).filter(Boolean) };
    case "list(number)": return t === "" ? { set: false } : { set: true, value: t.split(",").map(s => Number(s.trim())) };
    case "map(string)": case "map(bool)": case "json":
      if (t === "") return { set: false };
      try { return { set: true, value: JSON.parse(t) }; } catch { return { set: false, error: `${inp.name} must be valid JSON` }; }
    default: return t === "" ? { set: false } : { set: true, value: t };
  }
}

// A draft handed over by the assistant (validated there, but reviewed and submitted here).
export const DRAFT_KEY = "pravaha.draft";
type Draft = { tenant: string; name: string; bu: string; environment: string; spec: StackSpec };

function fieldFrom(inp: CatalogInput, v: unknown): Field {
  const f = blank(inp);
  if (v === undefined) return f;
  if (v && typeof v === "object" && "$ref" in (v as Record<string, unknown>)) return { ...f, mode: "ref", ref: String((v as Record<string, unknown>).$ref) };
  if (v && typeof v === "object" && "$secret" in (v as Record<string, unknown>)) return { ...f, mode: "secret", secret: String((v as Record<string, unknown>).$secret) };
  if (inp.type === "bool") return { ...f, text: v === true ? "true" : "false" };
  if (Array.isArray(v) && inp.type.startsWith("list(")) return { ...f, text: v.join(", ") };
  return { ...f, text: typeof v === "object" ? JSON.stringify(v) : String(v) };
}

export default function StackNew({ ctx }: { ctx: Ctx }) {
  const api = ctx.api;
  const catalog = useLoad(api.catalog, [ctx.t.slug]);
  const envs = useLoad(api.environments, [ctx.t.slug]);
  // The stack belongs to a business unit; it deploys to an environment of that BU's product.
  const units = allBUs(ctx.t).filter(b => canChange(ctx.t, b.slug) && inScope(ctx, b.slug, b.entity));
  const [bu, setBu] = useState("");
  const unit = units.find(b => b.slug === bu) ?? (units.length === 1 ? units[0] : undefined);
  const writable = (envs.data ?? []).filter(e => unit && e.entity === unit.entity);
  const [name, setName] = useState("");
  const [env, setEnv] = useState("");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.preview>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [seq, setSeq] = useState(1);
  const [imports, setImports] = useState("");
  const [proposed, setProposed] = useState<{ pr_number: number; html_url: string; file: string } | null>(null);
  // With a GitHub contracts repository on the app, stacks are proposed as pull requests (Git stays the source of truth).
  const contracts = useLoad(api.contracts, [ctx.t.slug]);
  const viaGit = contracts.data?.config?.provider === "github" && contracts.data.config.auth === "github_app";

  useEffect(() => {
    if (!catalog.data || !envs.data) return;
    let d: Draft | null = null;
    try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null"); sessionStorage.removeItem(DRAFT_KEY); } catch { d = null; }
    if (!d || d.tenant !== ctx.t.slug) return;
    const byId = new Map(catalog.data.modules.flatMap(m => [[m.id, m], [m.kind, m]] as [string, CatalogModule][]));
    let k = seq;
    const insts: Instance[] = [];
    for (const ref of d.spec.modules ?? []) {
      const m = byId.get(ref.module ?? ref.kind ?? "");
      if (!m) continue;
      insts.push({
        key: k++, name: ref.name, module: m.id, version: ref.version ?? "",
        fields: Object.fromEntries(m.inputs.map(inp => [inp.name, fieldFrom(inp, ref.inputs?.[inp.name])])),
        outputs: (d.spec.outputs ?? []).filter(o => o.module === ref.name).map(o => o.output),
      });
    }
    setName(d.name); setBu(d.bu); setEnv(d.environment); setInstances(insts); setSeq(k);
    setImports((d.spec.imports ?? []).map(i => `${i.to} = ${i.id}`).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data, envs.data]);

  const environment = writable.find(e => e.name === env);
  const cloud = environment?.cloud.provider ?? "";
  const mods = useMemo(() => new Map((catalog.data?.modules ?? []).map(m => [m.id, m])), [catalog.data]);
  const defaults = catalog.data?.defaults ?? {};
  const available = (catalog.data?.modules ?? []).filter(m => !m.cloud || m.cloud === cloud);

  if (!catalog.data || !envs.data) return catalog.error || envs.error ? <ErrorBox error={catalog.error || envs.error} /> : <Loading />;

  const add = (m: CatalogModule) => {
    const base = m.id.replace(/^(aws|gcp|azure)-/, "").replace(/-/g, "_").slice(0, 30);
    let n = base, i = 2;
    while (instances.some(x => x.name === n)) n = `${base}_${i++}`;
    setInstances([...instances, { key: seq, name: n, module: m.id, version: "", fields: Object.fromEntries(m.inputs.map(inp => [inp.name, blank(inp)])), outputs: [] }]);
    setSeq(seq + 1); setPreview(null);
  };
  const update = (key: number, fn: (i: Instance) => Instance) => { setInstances(instances.map(i => (i.key === key ? fn(i) : i))); setPreview(null); };

  const build = (): StackSpec | null => {
    const problems: string[] = [];
    const spec: StackSpec = { modules: [], outputs: [] };
    for (const inst of instances) {
      const m = mods.get(inst.module)!;
      const inputs: Record<string, unknown> = {};
      for (const inp of m.inputs) {
        const r = convert(inp, inst.fields[inp.name]);
        if (r.error) problems.push(`${inst.name}: ${r.error}`);
        if (r.set) inputs[inp.name] = r.value;
      }
      spec.modules.push({ name: inst.name, kind: m.kind, version: inst.version || undefined, inputs });
      for (const o of inst.outputs) spec.outputs!.push({ name: `${inst.name}_${o}`.replace(/-/g, "_").slice(0, 40), module: inst.name, output: o });
    }
    for (const line of imports.split("\n").map(l => l.trim()).filter(Boolean)) {
      const i = line.indexOf("=");
      if (i < 0) { problems.push(`import "${line}" must look like: module.name.type.resource = cloud-id`); continue; }
      (spec.imports ??= []).push({ to: line.slice(0, i).trim(), id: line.slice(i + 1).trim() });
    }
    if (problems.length) { setError(Object.assign(new Error("Fix these fields"), { status: 0, details: problems })); return null; }
    return spec;
  };

  const doPreview = async () => {
    setError(null);
    const spec = build();
    if (!spec) return;
    try { setPreview(await api.preview({ name: name || "preview", bu: unit?.slug ?? "", environment: env, spec })); } catch (e) { setError(e); }
  };
  const proposeViaPR = async () => {
    setError(null);
    const spec = build();
    if (!spec) return;
    try { setProposed(await api.propose({ name, bu: unit?.slug ?? "", environment: env, spec })); } catch (e) { setError(e); }
  };
  const create = async () => {
    setError(null);
    const spec = build();
    if (!spec) return;
    try { const s = await api.createStack({ name, bu: unit?.slug ?? "", environment: env, spec }); go(`t/${ctx.t.slug}/stacks/${s.id}`); } catch (e) { setError(e); }
  };

  const refOptions = (self: string) => instances.filter(i => i.name !== self).flatMap(i => mods.get(i.module)!.outputs.map(o => `${i.name}.${o}`));

  return (
    <>
      <div className="head"><div><h1>New stack</h1><div className="muted">Compose approved public modules. Versions are pinned and security baselines are applied automatically.</div></div></div>

      <section className="panel stepbox">
        <h2><span className="step-n on">1</span> Where it deploys</h2>
        {units.length === 0 ? <p className="muted">You cannot create stacks: you need the developer or admin role in a business unit.</p> : (
          <div className="grid">
            <div><label htmlFor="sn">Stack name</label><input id="sn" value={name} onChange={e => setName(e.target.value.toLowerCase())} placeholder="payments-network" />
              {name && !/^[a-z][a-z0-9-]{1,62}$/.test(name) && <div className="small del">Lowercase letters, digits and dashes, starting with a letter.</div>}</div>
            <div><label htmlFor="sb">Business unit</label>
              <select id="sb" value={unit?.slug ?? ""} onChange={e => { setBu(e.target.value); setEnv(""); setInstances([]); setPreview(null); }}>
                {units.length !== 1 && <option value="">Choose…</option>}
                {units.map(b => <option key={b.slug} value={b.slug}>{b.entityName} / {b.name}</option>)}
              </select></div>
            <div><label htmlFor="se">Environment</label>
              <select id="se" value={env} disabled={!unit} onChange={e => { setEnv(e.target.value); setInstances([]); setPreview(null); }}>
                <option value="">{unit ? "Choose…" : "Choose a business unit first"}</option>
                {writable.map(e => <option key={e.id} value={e.name}>{e.name} — {e.tier}{e.connection ? `, ${e.connection}` : ", no cloud"}</option>)}
              </select>
              {unit && writable.length === 0 && <div className="small del">{unit.entityName} has no environments yet. A tenant or product admin adds them in Tenant settings → Organisation.</div>}</div>
          </div>
        )}
        {environment && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Shared by all business units of {unit?.entityName} ·{" "}
            <span className={`badge ${environment.tier === "prod" ? "wait" : "idle"}`}>{environment.tier}</span>{" "}
            {environment.connection ? <>cloud <strong>{environment.cloud.provider}</strong> via {environment.connection}</> : "no cloud connection"} · runner pool <span className="tag">{environment.runner_pool}</span>
          </p>
        )}
      </section>

      <section className={`panel stepbox ${env ? "" : "dim"}`}>
        <h2><span className={`step-n ${env ? "on" : ""}`}>2</span> Modules</h2>
        {!env ? <p className="muted">Choose an environment first: it decides which cloud’s modules can be used.</p> : (
          <>
            {!cloud || cloud === "none" ? (
              <p className="small muted">This environment has no cloud connection, so only modules that need no cloud are offered. Pick an environment with an AWS, GCP or Azure connection to use cloud modules.</p>
            ) : <p className="small muted">Showing modules for <strong>{cloud}</strong> and cloud-independent ones.</p>}
            <input type="search" placeholder="Search modules" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
            <div className="module-grid">
              {available.filter(m => !q || `${m.title} ${m.id} ${m.source}`.toLowerCase().includes(q.toLowerCase())).map(m => {
                const count = instances.filter(i => i.module === m.id).length;
                return (
                  <div key={m.id} className="card module-card">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{m.title}</strong>
                      <span className="badge idle">{m.cloud || "any cloud"}</span>
                    </div>
                    <span className="mono small muted">{m.source}</span>
                    <button className={count ? "ghost small" : "small"} onClick={() => add(m)}>{count ? `Add another (${count} added)` : "Add"}</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {env && instances.length > 0 && <h2 className="step-title"><span className="step-n on">3</span> Configure</h2>}
      {env && instances.map(inst => {
        const m = mods.get(inst.module)!;
        return (
          <div className="modbox panel" key={inst.key}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><strong>{m.title}</strong> <span className="tag">kind {m.kind}</span> <span className="tag">{m.source}</span></div>
              <button className="ghost small" onClick={() => setInstances(instances.filter(i => i.key !== inst.key))}>Remove</button>
            </div>
            <div className="grid">
              <div><label>Instance name</label><input value={inst.name} onChange={e => update(inst.key, i => ({ ...i, name: e.target.value }))} /></div>
              <div><label>Version</label><select value={inst.version} onChange={e => update(inst.key, i => ({ ...i, version: e.target.value }))}>
                <option value="">default ({defaults[m.kind]?.version ?? m.versions[m.versions.length - 1]})</option>
                {m.versions.map(v => <option key={v}>{v}</option>)}</select></div>
            </div>
            <p className="small muted" style={{ margin: "4px 0 8px" }}>Leave a field empty to use its default; only what you change is stored with the stack.</p>
            {m.inputs.map(inp => {
              const f = inst.fields[inp.name];
              const set = (p: Partial<Field>) => update(inst.key, i => ({ ...i, fields: { ...i.fields, [inp.name]: { ...f, ...p } } }));
              const refs = inp.type !== "bool" ? refOptions(inst.name) : [];
              const def = effectiveDefault(inp, defaults[m.kind], environment?.tier ?? "nonprod");
              const hint = def ? `${def.from}: ${show(def.value)}` : inp.type.startsWith("list") ? "comma, separated" : inp.pattern ?? "";
              const canSecret = inp.type === "string";
              return (
                <div key={inp.name}>
                  <label>{inp.name}{inp.required && !def && " *"} {inp.sensitive && <span className="badge wait">sensitive</span>} <span className="muted">{inp.type} — {inp.description}</span></label>
                  {(refs.length > 0 || (canSecret && !inp.sensitive)) && (
                    <div className="row small" style={{ marginBottom: 4 }}>
                      <label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" checked={f.mode === "value"} onChange={() => set({ mode: "value" })} /> value</label>
                      {refs.length > 0 && <label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" checked={f.mode === "ref"} onChange={() => set({ mode: "ref" })} /> output of another resource</label>}
                      {canSecret && <label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" checked={f.mode === "secret"} onChange={() => set({ mode: "secret" })} /> secret from the vault</label>}
                    </div>
                  )}
                  {f.mode === "ref" ? (
                    <select value={f.ref} onChange={e => set({ ref: e.target.value })}><option value="">Choose…</option>{refs.map(r => <option key={r}>{r}</option>)}</select>
                  ) : f.mode === "secret" ? (
                    <>
                      <input className="mono" value={f.secret} onChange={e => set({ secret: e.target.value })} placeholder="vault://kv/payments/orders-db#password" />
                      <div className="small muted">The run reads it from the tenant's secret store at plan time. The value never reaches Git or the platform.</div>
                    </>
                  ) : inp.type === "bool" ? (
                    <select value={f.text} onChange={e => set({ text: e.target.value })}>
                      <option value="">{def ? `default (${show(def.value)})` : "module default"}</option><option value="true">true</option><option value="false">false</option>
                    </select>
                  ) : inp.allowed ? (
                    <select value={f.text} onChange={e => set({ text: e.target.value })}><option value="">{def ? `default (${show(def.value)})` : "module default"}</option>{inp.allowed.map(a => <option key={String(a)}>{String(a)}</option>)}</select>
                  ) : inp.type === "json" || inp.type.startsWith("map") ? (
                    <textarea value={f.text} onChange={e => set({ text: e.target.value })} placeholder={def ? hint : inp.type.startsWith("map") ? '{"team": "platform"}' : "JSON"} spellCheck={false} />
                  ) : (
                    <input value={f.text} onChange={e => set({ text: e.target.value })} placeholder={hint} />
                  )}
                  {inp.type.startsWith("map(") && def && f.mode === "value" && <div className="small muted">Your keys are added to the default map; yours win on conflicts.</div>}
                </div>
              );
            })}
            {m.enforced && <p className="muted small" style={{ marginTop: 12 }}>Enforced baseline: {Object.keys(m.enforced).map(k => <span key={k} className="tag">{k}</span>)}</p>}
            <label>Expose outputs</label>
            <div className="row">{m.outputs.map(o => (
              <label key={o} className="row small" style={{ margin: 0, fontWeight: 400 }}>
                <input type="checkbox" checked={inst.outputs.includes(o)} onChange={e => update(inst.key, i => ({ ...i, outputs: e.target.checked ? [...i.outputs, o] : i.outputs.filter(x => x !== o) }))} /> {o}
              </label>))}
            </div>
          </div>
        );
      })}

      {env && instances.length > 0 && (
        <>
          <h2 className="step-title"><span className="step-n on">4</span> Review and create</h2>
          <details className="panel section">
            <summary><h2>Import existing resources <span className="muted small">(optional — backporting)</span></h2></summary>
            <p className="muted small">Adopt resources that already exist in the cloud instead of creating them. One per line: an address inside one of the modules above, then its cloud ID. Imports raise the run's risk, and an import the plan would replace is blocked.</p>
            <textarea value={imports} onChange={e => setImports(e.target.value)} placeholder={"module.network.aws_vpc.this[0] = vpc-0a1b2c3d4e5f67890"} spellCheck={false} />
          </details>
        </>
      )}
      <ErrorBox error={error} />
      {preview && !preview.valid && <div className="error"><strong>The spec was rejected</strong><ul>{preview.problems?.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {preview?.valid && (
        <div className="panel">
          <h2>Generated OpenTofu configuration</h2>
          <p className="muted small">Providers: {preview.providers?.map(p => <span key={p} className="tag">{p}</span>)}</p>
          {Object.entries(preview.files ?? {}).map(([f, c]) => <div key={f}><h3 className="mono">{f}</h3><pre className="code">{c}</pre></div>)}
        </div>
      )}
      {env && instances.length > 0 && (
        proposed ? (
          <div className="notice">Pull request <a href={proposed.html_url} target="_blank" rel="noreferrer noopener">#{proposed.pr_number}</a> opened with <span className="mono">{proposed.file}</span>. It is planned now; after the required approvals it is applied and then merged.</div>
        ) : (
          <div className="action-bar">
            <span className="small muted">{instances.length} module{instances.length === 1 ? "" : "s"} · {unit?.name} · {env}{!name && " · give the stack a name"}</span>
            <div className="row">
              <button className="ghost" onClick={doPreview}>Preview configuration</button>
              {viaGit ? <button disabled={!name} onClick={proposeViaPR} title={`to ${contracts.data?.config?.repo}; applied before it merges`}>Open a pull request</button>
                : <button disabled={!name} onClick={create}>Create stack</button>}
            </div>
          </div>
        )
      )}
    </>
  );
}
