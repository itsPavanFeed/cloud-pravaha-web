import { useState } from "react";
import type { Ctx } from "../App";
import { canChange, type StackSpec } from "../api";
import { ErrorBox, Loading, Time, go, useLoad } from "../ui";
import { RunTable } from "./Runs";

export default function StackDetail({ ctx, id }: { ctx: Ctx; id: string }) {
  const api = ctx.api;
  const { data: stack, error, reload } = useLoad(() => api.stack(id), [ctx.t.slug, id]);
  const runs = useLoad(() => api.stackRuns(id), [id], 4000);
  const states = useLoad(() => api.stateVersions(id), [id], 10000);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);

  if (!stack) return error ? <ErrorBox error={error} /> : <Loading />;
  const start = async (op: "apply" | "destroy" | "drift") => {
    setActionError(null);
    try { const r = await api.createRun(stack.id, op); go(`t/${ctx.t.slug}/runs/${r.id}`); } catch (e) { setActionError(e); }
  };
  const save = async () => {
    setActionError(null);
    let spec: StackSpec;
    try { spec = JSON.parse(text); } catch { setActionError(new Error("Spec is not valid JSON")); return; }
    try { await api.updateStack(stack.id, spec); setEditing(false); reload(); } catch (e) { setActionError(e); }
  };

  return (
    <>
      <div className="head">
        <div><div className="muted small">{stack.environment} · {stack.entity} / <span className="tag">{stack.bu}</span></div><h1>{stack.name}</h1>
          <div className="muted small">Created by {stack.created_by} · updated <Time iso={stack.updated_at} /></div></div>
        {canChange(ctx.t, stack.bu) && (
          <div className="row">
            <button onClick={() => start("apply")}>Plan changes</button>
            <button className="ghost" onClick={() => start("drift")}>Check drift</button>
            <button className="ghost" onClick={() => start("destroy")}>Plan destroy</button>
          </div>
        )}
      </div>
      <ErrorBox error={actionError} />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Spec</h2>
          {stack.managed_by === "git"
            ? <span className="badge idle">managed by Git @ {stack.source_ref?.slice(0, 7)} — edit it in the contracts repository</span>
            : canChange(ctx.t, stack.bu) && !editing && <button className="ghost small" onClick={() => { setText(JSON.stringify(stack.spec, null, 2)); setEditing(true); }}>Edit</button>}
        </div>
        {editing ? (
          <>
            <p className="muted small">Only catalog modules, approved versions and literal values or <code>{`{"$ref": "module.output"}`}</code> references are accepted.</p>
            <textarea style={{ minHeight: 280 }} value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
            <div className="row" style={{ marginTop: 10 }}><button onClick={save}>Save</button><button className="ghost" onClick={() => setEditing(false)}>Cancel</button></div>
          </>
        ) : (
          <div className="grid" style={{ marginTop: 12 }}>
            {stack.spec.modules.map(m => (
              <div className="card" key={m.name}>
                <h3>{m.name} <span className="tag">{m.kind ?? m.module}</span> <span className="tag" title={m.module}>v{m.version}</span></h3>
                <pre className="code small">{JSON.stringify(m.inputs ?? {}, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Drift</h2>
        <p className="muted small">Drift checks run only when someone starts one (Check drift above). A check is a refresh-only plan: it compares the live resources with the last apply, changes nothing and needs no approvals. When it finds drift, you decide on its result page: revert the live resources to the code, or keep the live change by updating the {stack.managed_by === "git" ? "contract" : "stack"}.</p>
      </div>

      <h2>Runs</h2>
      <ErrorBox error={runs.error} />
      {runs.data && (runs.data.length ? <RunTable ctx={ctx} runs={runs.data} showStack={false} /> : <p className="muted">No runs yet.</p>)}

      <h2 style={{ marginTop: 18 }}>State versions</h2>
      <p className="muted small">State is encrypted by OpenTofu on the runner before upload; the control plane stores ciphertext only.</p>
      {states.data && (states.data.length === 0 ? <p className="muted">No state yet.</p> : (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Serial</th><th>SHA-256</th><th>Size</th><th>Written</th></tr></thead>
            <tbody>{states.data.map(v => (
              <tr key={v.serial}><td>{v.serial}</td><td className="mono small">{v.sha256.slice(0, 20)}…</td><td>{(v.size / 1024).toFixed(1)} KiB</td><td><Time iso={v.created_at} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}
