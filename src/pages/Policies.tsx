import { useState } from "react";
import type { Ctx } from "../App";
import { has, type PolicySet, type Violation } from "../api";
import ChangeEditor, { type EditFile } from "../components/ChangeEditor";
import { ErrorBox, Loading, Time, useLoad } from "../ui";

const starterTest = (name: string) => `package pravaha.policy_test

import data.pravaha.policy

test_${name.replace(/-/g, "_")}_allows_an_empty_plan if {
	count(policy.deny) == 0 with input as {"run": {"tier": "prod"}, "summary": {"resources": []}}
}
`;

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
  const canWrite = has(ctx.t, "tenant_admin", "security");
  type Draft = { id: string; name: string; scope: string; level: "hard" | "advisory"; module: string; enabled: boolean };
  const blank: Draft = { id: "", name: "", scope: "tenant", level: "hard", module: starter, enabled: true };
  const [edit, setEdit] = useState<Draft | null>(null);
  // Sets from a policy release are read-only here; they change through the repository.
  const writer = canWrite && !(edit?.id && data?.find(p => p.id === edit.id)?.source === "release");
  const [runId, setRunId] = useState("");
  const [test, setTest] = useState<Violation[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); } catch (e) { setErr(e); } };
  const scopes = ["tenant", ...ctx.t.entities.flatMap(e => [`entity:${e.slug}`, ...e.bus.map(b => `bu:${b.slug}`)])];
  // Policy sets that come from the policies repository are changed there:
  // through a pull request, or here through the change editor (which builds
  // the change first and commits it as a pull request).
  const editor = has(ctx.t, "tenant_admin", "devops");
  const source = useLoad(() => (editor ? ctx.api.releaseSource("policies") : Promise.resolve(null)), [ctx.t.slug]);
  const active = useLoad(async () => {
    const rs = (await ctx.api.releases("policies")).releases.find(r => r.status === "active");
    return rs ? (await ctx.api.release("policies", rs.id)).manifest?.policies ?? [] : [];
  }, [ctx.t.slug]);
  const [gitEdit, setGitEdit] = useState<{ title: string; files: EditFile[] } | null>(null);
  const [newSet, setNewSet] = useState<{ name: string; scope: string } | null>(null);
  const fileOf = (name: string) => active.data?.find(p => p.name === name)?.file;
  const repoPath = (name: string, scope: string) => {
    const [k, slug] = scope.split(":");
    const dir = k === "entity" ? `tenants/${ctx.t.slug}/entities/${slug}` : k === "bu" ? `tenants/${ctx.t.slug}/bus/${slug}` : `tenants/${ctx.t.slug}`;
    return `${dir}/${name}.rego`;
  };
  const gitFiles = (rego: string, name: string, isNew: boolean): EditFile[] => [
    { path: rego, label: "Policy set", template: isNew ? starter : undefined },
    { path: rego.replace(/\.rego$/, "_test.rego"), label: "Tests (run on every build; a failing test stops the release)", template: starterTest(name), optional: !isNew },
    { path: rego.replace(/\.rego$/, ".yaml"), label: "Settings (level: hard or advisory)", template: "apiVersion: pravaha/v1\nkind: PolicySet\nlevel: hard\ndescription: \n", optional: true },
  ];

  if (gitEdit) return <ChangeEditor ctx={ctx} kind="policies" title={gitEdit.title} files={gitEdit.files} onClose={() => setGitEdit(null)}
    intro="The change is compiled and its tests run before anything is committed; DevOps then approves activating the policy release, which merges the pull request." />;
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head">
        <div><h1>Policies</h1><div className="muted">Rego policy sets evaluated against every plan, next to the built-in rules. Hard violations block approval; advisory ones are shown to approvers. Policies fail closed.</div></div>
        <div className="row">
          {editor && source.data?.config && !newSet && <button className="ghost" onClick={() => setNewSet({ name: "", scope: "tenant" })}>Propose a set through Git</button>}
          {canWrite && !edit && <button onClick={() => { setEdit(blank); setTest(null); }}>New policy set</button>}
        </div>
      </div>
      {newSet && (
        <div className="panel">
          <h3>Propose a policy set through the policies repository</h3>
          <div className="grid">
            <div><label>Name</label><input value={newSet.name} placeholder="prod-versioning" onChange={e => setNewSet({ ...newSet, name: e.target.value.toLowerCase() })} /></div>
            <div><label>Scope</label><select value={newSet.scope} onChange={e => setNewSet({ ...newSet, scope: e.target.value })}>{scopes.map(sc => <option key={sc}>{sc}</option>)}</select></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button disabled={!/^[a-z0-9][a-z0-9-]{0,40}$/.test(newSet.name)} onClick={() => { setGitEdit({ title: `Add policy set ${newSet.name}`, files: gitFiles(repoPath(newSet.name, newSet.scope), newSet.name, true) }); setNewSet(null); }}>Write it</button>
            <button className="ghost" onClick={() => setNewSet(null)}>Cancel</button>
          </div>
        </div>
      )}
      <ErrorBox error={err} />
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Policy set</th><th>Scope</th><th>Level</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>{data.map((p: PolicySet) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong>{p.source === "release" && <span className="badge idle" style={{ marginLeft: 6 }} title="Managed in the policies repository">release</span>}</td><td><span className="tag">{p.scope}</span></td>
              <td><span className={`badge ${p.level === "hard" ? "bad" : "wait"}`}>{p.level}</span></td>
              <td>{p.enabled ? <span className="badge ok">enabled</span> : <span className="badge idle">disabled</span>}</td>
              <td className="small">{p.updated_by} · <Time iso={p.updated_at} /></td>
              <td className="nowrap">
                {p.source === "release" && editor && fileOf(p.name) && <button className="ghost small" onClick={() => setGitEdit({ title: `Update policy set ${p.name}`, files: gitFiles(fileOf(p.name)!, p.name, false) })}>Edit in repository</button>}
                {p.source !== "release" && <button className="ghost small" onClick={() => { setEdit({ id: p.id, name: p.name, scope: p.scope, level: p.level, module: p.module, enabled: p.enabled }); setTest(null); }}>{writer ? "Edit" : "View"}</button>}
                {p.source === "release" && <button className="ghost small" onClick={() => { setEdit({ id: p.id, name: p.name, scope: p.scope, level: p.level, module: p.module, enabled: p.enabled }); setTest(null); }}>View</button>}
              </td>
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
