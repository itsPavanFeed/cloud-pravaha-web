import { useMemo, useState } from "react";
import { inScope, type Ctx } from "../App";
import { canChange, type CatalogInput, type CatalogModule, type StackSpec } from "../api";
import { ErrorBox, Loading, go, useLoad } from "../ui";

// Raw form values per module instance; converted to typed inputs on submit.
type Field = { mode: "value" | "ref"; text: string; bool: boolean; ref: string };
type Instance = { key: number; name: string; module: string; version: string; fields: Record<string, Field>; outputs: string[] };

const blank = (inp: CatalogInput): Field => ({
  mode: "value",
  text: inp.default === undefined ? "" : typeof inp.default === "object" ? JSON.stringify(inp.default) : String(inp.default),
  bool: inp.default === true,
  ref: "",
});

function convert(inp: CatalogInput, f: Field): { set: boolean; value?: unknown; error?: string } {
  if (f.mode === "ref") return f.ref ? { set: true, value: { $ref: f.ref } } : { set: false };
  const t = f.text.trim();
  switch (inp.type) {
    case "bool": return inp.default === f.bool ? { set: false } : { set: true, value: f.bool };
    case "number": return t === "" ? { set: false } : isNaN(Number(t)) ? { set: false, error: `${inp.name} must be a number` } : { set: true, value: Number(t) };
    case "list(string)": return t === "" ? { set: false } : { set: true, value: t.split(",").map(s => s.trim()).filter(Boolean) };
    case "list(number)": return t === "" ? { set: false } : { set: true, value: t.split(",").map(s => Number(s.trim())) };
    case "map(string)": case "map(bool)": case "json":
      if (t === "") return { set: false };
      try { return { set: true, value: JSON.parse(t) }; } catch { return { set: false, error: `${inp.name} must be valid JSON` }; }
    default: return t === "" ? { set: false } : { set: true, value: t };
  }
}

export default function StackNew({ ctx }: { ctx: Ctx }) {
  const api = ctx.api;
  const catalog = useLoad(api.catalog, [ctx.t.slug]);
  const envs = useLoad(api.environments, [ctx.t.slug]);
  const writable = (envs.data ?? []).filter(e => canChange(ctx.t, e.bu) && inScope(ctx, e.bu, e.entity));
  const [name, setName] = useState("");
  const [env, setEnv] = useState("");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [picker, setPicker] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.preview>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [seq, setSeq] = useState(1);

  const environment = envs.data?.find(e => e.name === env);
  const cloud = environment?.cloud.provider ?? "";
  const mods = useMemo(() => new Map((catalog.data?.modules ?? []).map(m => [m.id, m])), [catalog.data]);
  const available = (catalog.data?.modules ?? []).filter(m => !m.cloud || m.cloud === cloud);

  if (!catalog.data || !envs.data) return catalog.error || envs.error ? <ErrorBox error={catalog.error || envs.error} /> : <Loading />;

  const add = (m: CatalogModule) => {
    const base = m.id.replace(/^(aws|gcp|azure)-/, "").replace(/-/g, "_").slice(0, 30);
    let n = base, i = 2;
    while (instances.some(x => x.name === n)) n = `${base}_${i++}`;
    setInstances([...instances, { key: seq, name: n, module: m.id, version: m.versions[m.versions.length - 1], fields: Object.fromEntries(m.inputs.map(inp => [inp.name, blank(inp)])), outputs: [] }]);
    setSeq(seq + 1); setPicker(""); setPreview(null);
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
      spec.modules.push({ name: inst.name, module: inst.module, version: inst.version, inputs });
      for (const o of inst.outputs) spec.outputs!.push({ name: `${inst.name}_${o}`.replace(/-/g, "_").slice(0, 40), module: inst.name, output: o });
    }
    if (problems.length) { setError(Object.assign(new Error("Fix these fields"), { status: 0, details: problems })); return null; }
    return spec;
  };

  const doPreview = async () => {
    setError(null);
    const spec = build();
    if (!spec) return;
    try { setPreview(await api.preview({ name: name || "preview", environment: env, spec })); } catch (e) { setError(e); }
  };
  const create = async () => {
    setError(null);
    const spec = build();
    if (!spec) return;
    try { const s = await api.createStack({ name, environment: env, spec }); go(`t/${ctx.t.slug}/stacks/${s.id}`); } catch (e) { setError(e); }
  };

  const refOptions = (self: string) => instances.filter(i => i.name !== self).flatMap(i => mods.get(i.module)!.outputs.map(o => `${i.name}.${o}`));

  return (
    <>
      <div className="head"><div><h1>New stack</h1><div className="muted">Compose approved public modules. The stack belongs to its environment’s business unit; versions are pinned and security baselines are applied automatically.</div></div></div>
      <div className="panel">
        <div className="grid">
          <div><label htmlFor="sn">Stack name</label><input id="sn" value={name} onChange={e => setName(e.target.value)} placeholder="payments-network" pattern="[a-z][a-z0-9-]{1,62}" /></div>
          <div><label htmlFor="se">Environment</label>
            <select id="se" value={env} onChange={e => { setEnv(e.target.value); setInstances([]); setPreview(null); }}>
              <option value="">Choose…</option>
              {writable.map(e => <option key={e.id} value={e.name}>{e.entity} / {e.bu} / {e.name} ({e.connection || "no cloud"}, {e.tier})</option>)}
            </select></div>
        </div>
      </div>

      {env && instances.map(inst => {
        const m = mods.get(inst.module)!;
        return (
          <div className="modbox panel" key={inst.key}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><strong>{m.title}</strong> <span className="tag">{m.source}</span></div>
              <button className="ghost small" onClick={() => setInstances(instances.filter(i => i.key !== inst.key))}>Remove</button>
            </div>
            <div className="grid">
              <div><label>Instance name</label><input value={inst.name} onChange={e => update(inst.key, i => ({ ...i, name: e.target.value }))} /></div>
              <div><label>Version</label><select value={inst.version} onChange={e => update(inst.key, i => ({ ...i, version: e.target.value }))}>{m.versions.map(v => <option key={v}>{v}</option>)}</select></div>
            </div>
            {m.inputs.map(inp => {
              const f = inst.fields[inp.name];
              const set = (p: Partial<Field>) => update(inst.key, i => ({ ...i, fields: { ...i.fields, [inp.name]: { ...f, ...p } } }));
              const refs = inp.type === "string" ? refOptions(inst.name) : [];
              return (
                <div key={inp.name}>
                  <label>{inp.name}{inp.required && " *"} <span className="muted">{inp.type} — {inp.description}</span></label>
                  {refs.length > 0 && (
                    <div className="row small" style={{ marginBottom: 4 }}>
                      <label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" checked={f.mode === "value"} onChange={() => set({ mode: "value" })} /> value</label>
                      <label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" checked={f.mode === "ref"} onChange={() => set({ mode: "ref" })} /> output of another module</label>
                    </div>
                  )}
                  {f.mode === "ref" ? (
                    <select value={f.ref} onChange={e => set({ ref: e.target.value })}><option value="">Choose…</option>{refs.map(r => <option key={r}>{r}</option>)}</select>
                  ) : inp.type === "bool" ? (
                    <input type="checkbox" checked={f.bool} onChange={e => set({ bool: e.target.checked })} />
                  ) : inp.allowed ? (
                    <select value={f.text} onChange={e => set({ text: e.target.value })}><option value="">(module default)</option>{inp.allowed.map(a => <option key={String(a)}>{String(a)}</option>)}</select>
                  ) : inp.type === "json" || inp.type.startsWith("map") ? (
                    <textarea value={f.text} onChange={e => set({ text: e.target.value })} placeholder={inp.type.startsWith("map") ? '{"team": "platform"}' : "JSON"} spellCheck={false} />
                  ) : (
                    <input value={f.text} onChange={e => set({ text: e.target.value })} placeholder={inp.type.startsWith("list") ? "comma, separated" : inp.pattern ?? ""} />
                  )}
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

      {env && (
        <div className="panel">
          <label htmlFor="pick">Add a module</label>
          <div className="row">
            <select id="pick" style={{ maxWidth: 420 }} value={picker} onChange={e => setPicker(e.target.value)}>
              <option value="">Choose from the catalog…</option>
              {available.map(m => <option key={m.id} value={m.id}>{m.title} — {m.source}</option>)}
            </select>
            <button className="ghost" disabled={!picker} onClick={() => add(mods.get(picker)!)}>Add</button>
          </div>
        </div>
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
        <div className="row"><button className="ghost" onClick={doPreview}>Preview configuration</button><button disabled={!name} onClick={create}>Create stack</button></div>
      )}
    </>
  );
}
