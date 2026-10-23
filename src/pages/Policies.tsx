import { useState } from "react";
import type { Ctx } from "../App";
import { has, type PolicySet, type Violation } from "../api";
import { ErrorBox, Loading, Time, useLoad } from "../ui";

const starter = `package pravaha.policy

# Each element of deny is a violation: a string, or {"msg": ..., "address": ...}.
# input.run    {operation, stack, bu, entity, environment, tier, created_by}
# input.summary {add, change, destroy, replace, imports, resources: [{address, type, actions, after}]}
# input.cost   {monthly_delta_usd, items}

deny contains {"msg": sprintf("%s: production buckets need versioning", [r.address]), "address": r.address} if {
	input.run.tier == "prod"
	some r in input.summary.resources
	r.type == "aws_s3_bucket_versioning"
	r.after.versioning_configuration[0].status != "Enabled"
}
`;

export default function Policies({ ctx }: { ctx: Ctx }) {
  const { data, error, reload } = useLoad(ctx.api.policies, [ctx.t.slug]);
  const writer = has(ctx.t, "tenant_admin", "security");
  type Draft = { id: string; name: string; scope: string; level: "hard" | "advisory"; module: string; enabled: boolean };
  const blank: Draft = { id: "", name: "", scope: "tenant", level: "hard", module: starter, enabled: true };
  const [edit, setEdit] = useState<Draft | null>(null);
  const [runId, setRunId] = useState("");
  const [test, setTest] = useState<Violation[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); } catch (e) { setErr(e); } };
  const scopes = ["tenant", ...ctx.t.entities.flatMap(e => [`entity:${e.slug}`, ...e.bus.map(b => `bu:${b.slug}`)])];

  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head">
        <div><h1>Policies</h1><div className="muted">Rego policy sets evaluated against every plan, next to the built-in rules. Hard violations block approval; advisory ones are shown to approvers. Policies fail closed.</div></div>
        {writer && !edit && <button onClick={() => { setEdit(blank); setTest(null); }}>New policy set</button>}
      </div>
      <ErrorBox error={err} />
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Policy set</th><th>Scope</th><th>Level</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>{data.map((p: PolicySet) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong></td><td><span className="tag">{p.scope}</span></td>
              <td><span className={`badge ${p.level === "hard" ? "bad" : "wait"}`}>{p.level}</span></td>
              <td>{p.enabled ? <span className="badge ok">enabled</span> : <span className="badge idle">disabled</span>}</td>
              <td className="small">{p.updated_by} · <Time iso={p.updated_at} /></td>
              <td><button className="ghost small" onClick={() => { setEdit({ id: p.id, name: p.name, scope: p.scope, level: p.level, module: p.module, enabled: p.enabled }); setTest(null); }}>{writer ? "Edit" : "View"}</button></td>
            </tr>))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="panel">
          <h2>{edit.id ? edit.name : "New policy set"}</h2>
          <div className="grid">
            {!edit.id && <div><label>Name</label><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="prod-versioning" /></div>}
            <div><label>Applies to</label><select value={edit.scope} disabled={!writer} onChange={e => setEdit({ ...edit, scope: e.target.value })}>{scopes.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>Level</label><select value={edit.level} disabled={!writer} onChange={e => setEdit({ ...edit, level: e.target.value as "hard" | "advisory" })}><option value="hard">hard (blocks)</option><option value="advisory">advisory</option></select></div>
            <div><label>Enabled</label><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" checked={edit.enabled} disabled={!writer} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} /> evaluate on every plan</label></div>
          </div>
          <label>Rego</label>
          <textarea style={{ minHeight: 280 }} value={edit.module} readOnly={!writer} onChange={e => setEdit({ ...edit, module: e.target.value })} spellCheck={false} />
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ maxWidth: 320 }} placeholder="run ID to test against" value={runId} onChange={e => setRunId(e.target.value)} />
            <button className="ghost" disabled={!runId} onClick={() => act(async () => setTest((await ctx.api.testPolicy(edit.module, runId)) ?? []))}>Dry run</button>
            {writer && <button onClick={() => act(async () => {
              if (edit.id) await ctx.api.updatePolicy(edit.id, edit); else await ctx.api.createPolicy(edit);
              setEdit(null); reload();
            })}>Save</button>}
            <button className="ghost" onClick={() => setEdit(null)}>Close</button>
          </div>
          {test && (test.length === 0 ? <div className="success">No violations for that run.</div> : (
            <div className="notice">{test.map((v, i) => <div key={i} className="small">{v.message} {v.address && <span className="mono muted">{v.address}</span>}</div>)}</div>
          ))}
        </div>
      )}
    </>
  );
}
