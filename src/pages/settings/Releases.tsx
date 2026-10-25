import { useState } from "react";
import { has, type Release, type ReleaseSource } from "../../api";
import { ErrorBox, Loading, Time, go, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

type Kind = "modules" | "policies";

const blank = (kind: Kind): ReleaseSource => ({ provider: "github", repo: "", branch: "main", path: kind === "policies" ? "policies" : "", poll_seconds: 300, enabled: true, approvals: 1 });

const statusBadge: Record<Release["status"], string> = { building: "busy", failed: "bad", ready: "wait", pending: "wait", active: "ok", superseded: "idle", discarded: "idle" };
const statusText: Record<Release["status"], string> = { building: "building", failed: "failed", ready: "built", pending: "awaiting approval", active: "active", superseded: "superseded", discarded: "discarded" };

const intro: Record<Kind, { title: string; text: string; layout: string }> = {
  modules: {
    title: "Module releases",
    text: "Pull requests and pushes to the modules repository, and kinds or defaults edited in the console, are built into releases: kinds and this tenant's defaults are validated, every module is vendored from the registry pinned to a commit, and kinds are checked against their modules. DevOps approves activating a release; activating a pull-request release merges it. Runs use only the active release.",
    layout: "catalog/providers/<cloud>.yaml · catalog/modules/<cloud>/<kind>.yaml · tenants/<tenant>/defaults/<Kind>.yaml",
  },
  policies: {
    title: "Policy releases",
    text: "Pull requests and pushes to the policies repository, and policy sets edited in the console, are built into releases: every Rego set compiles and its tests pass. DevOps approves activating a release; activating a pull-request release merges it. Active sets apply by scope.",
    layout: "global/<set>.rego · tenants/<tenant>/<set>.rego · tenants/<tenant>/entities/<entity>/… · tenants/<tenant>/bus/<bu>/… (+ <set>_test.rego, <set>.yaml)",
  },
};

// Routes: settings/releases[/modules|policies[/<release id>]].
export default function Releases({ ctx, route }: SectionProps & { route?: string[] }) {
  const kind: Kind = route?.[0] === "policies" ? "policies" : "modules";
  const selected = route?.[1];
  const base = `t/${ctx.t.slug}/settings/releases`;
  return (
    <>
      <div className="chips" role="tablist" aria-label="Release kind" style={{ marginBottom: 12 }}>
        {(["modules", "policies"] as const).map(k => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "chip on" : "chip"} onClick={() => go(`${base}/${k}`)}>{intro[k].title}</button>
        ))}
      </div>
      <Source ctx={ctx} kind={kind} key={"s" + kind} />
      <List ctx={ctx} kind={kind} selected={selected} base={`${base}/${kind}`} key={"l" + kind} />
    </>
  );
}

function Source({ ctx, kind }: { ctx: SectionProps["ctx"]; kind: Kind }) {
  const src = useLoad(() => ctx.api.releaseSource(kind), [ctx.t.slug, kind]);
  const [edit, setEdit] = useState<ReleaseSource | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  if (!src.data) return src.error ? <ErrorBox error={src.error} /> : <Loading />;
  const saved = src.data.config;
  const editing = edit !== null || !saved;
  const v = edit ?? saved ?? blank(kind);
  return (
    <div className="panel">
      <ErrorBox error={error} />
      <div className="drill-head">
        <div><h2>{intro[kind].title}</h2><div className="muted small">{intro[kind].text}</div></div>
        {saved && !editing && <button onClick={() => setEdit(saved)}>Edit source</button>}
      </div>
      {!editing && saved ? (
        <dl className="kv">
          <dt>Repository</dt><dd className="mono">{saved.provider}: {saved.repo} @ {saved.branch}{saved.path ? ` / ${saved.path}` : ""}</dd>
          <dt>Authentication</dt><dd>{saved.auth === "github_app" ? "GitHub App" : src.data.token_set ? "access token (stored)" : saved.provider === "local" ? "local directory (development)" : <span className="del">no token</span>}</dd>
          <dt>Builds</dt><dd>{saved.enabled ? `every pull request and push (webhooks; the branch is also polled every ${saved.poll_seconds}s)` : "on request, and for changes made in the console"}</dd>
          <dt>Activation</dt><dd>{saved.approvals === 0 ? "activates when requested (no approval)" : `needs ${saved.approvals} DevOps approval${saved.approvals > 1 ? "s" : ""}; the requester and the author cannot approve`}</dd>
          <dt>Expected layout</dt><dd className="mono small">{intro[kind].layout}</dd>
        </dl>
      ) : (
        <>
          <div className="grid">
            <div><label>Provider</label><select value={v.provider} onChange={e => setEdit({ ...v, provider: e.target.value as ReleaseSource["provider"] })}><option value="github">GitHub</option><option value="gitlab">GitLab</option></select></div>
            <div><label>Repository</label><input value={v.repo} placeholder={kind === "modules" ? "acme/cloud-pravaha-modules" : "acme/policies"} onChange={e => setEdit({ ...v, repo: e.target.value })} /></div>
            <div><label>Branch</label><input value={v.branch} onChange={e => setEdit({ ...v, branch: e.target.value })} /></div>
            <div><label>Folder <span className="muted">(empty = repository root)</span></label><input value={v.path} onChange={e => setEdit({ ...v, path: e.target.value })} /></div>
            {v.provider === "github" && <div><label>Authentication</label><select value={v.auth ?? "token"} onChange={e => setEdit({ ...v, auth: e.target.value as ReleaseSource["auth"] })}>
              <option value="token">Access token</option><option value="github_app">GitHub App (Integrations)</option></select></div>}
            <div><label>API URL <span className="muted">(GitHub Enterprise / self-hosted GitLab)</span></label><input value={v.api_url ?? ""} onChange={e => setEdit({ ...v, api_url: e.target.value || undefined })} /></div>
            <div><label>Poll every (seconds)</label><input type="number" min={30} value={v.poll_seconds} onChange={e => setEdit({ ...v, poll_seconds: Number(e.target.value) })} /></div>
          </div>
          <div className="row" style={{ margin: "10px 0" }}>
            <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.enabled} onChange={e => setEdit({ ...v, enabled: e.target.checked })} /> build pull requests and pushes automatically</label>
            <label className="row small" style={{ margin: 0, fontWeight: 400 }}>DevOps approvals to activate
              <select value={v.approvals} onChange={e => setEdit({ ...v, approvals: Number(e.target.value) })} style={{ width: "auto", marginLeft: 6 }}>
                {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? "none" : n}</option>)}</select></label>
          </div>
          {(v.auth ?? "token") === "token" && (
            <div className="row" style={{ marginBottom: 10 }}>
              <input type="password" value={token} placeholder={src.data.token_set ? "token stored; paste to replace" : "read-only access token"} onChange={e => setToken(e.target.value)} style={{ maxWidth: 360 }} autoComplete="off" />
              <span className="small muted">Contents: read only. Stored sealed, never shown again.</span>
            </div>
          )}
          <div className="row">
            <button onClick={() => run(async () => { await ctx.api.putReleaseSource(kind, v); if (token) await ctx.api.putReleaseToken(kind, token); setToken(""); setEdit(null); src.reload(); })}>Save</button>
            {saved && <button className="ghost" onClick={() => setEdit(null)}>Cancel</button>}
          </div>
        </>
      )}
    </div>
  );
}

function List({ ctx, kind, selected, base }: { ctx: SectionProps["ctx"]; kind: Kind; selected?: string; base: string }) {
  const rels = useLoad(() => ctx.api.releases(kind), [ctx.t.slug, kind], 4000);
  const cache = useLoad(() => (kind === "modules" ? ctx.api.bundleCache() : Promise.resolve(null)), [ctx.t.slug, kind], 15000);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); rels.reload(); } catch (e) { setError(e); } };
  if (!rels.data) return rels.error ? <ErrorBox error={rels.error} /> : <Loading />;
  const list = rels.data.releases;
  const active = list.find(r => r.status === "active");
  const pending = list.find(r => r.status === "pending");
  return (
    <div className="panel">
      <ErrorBox error={error} />
      <div className="drill-head">
        <div><h2>Releases</h2>
          <div className="muted small">
            {active ? <>Release <strong>{active.number}</strong> is active (from {active.revision.slice(0, 7)}).</> :
              kind === "modules" ? <>No release active: stacks use the catalog bundled with the platform{rels.data.bundled ? ` (${rels.data.bundled.kinds} kinds)` : ""}.</> : <>No policy release active.</>}
            {pending && <> Release <strong>{pending.number}</strong> waits for DevOps approval.</>}
            {cache.data && <> Bundle cache: {cache.data.memory_hits + cache.data.disk_hits} hits, {cache.data.origin_loads} reads from storage.</>}
          </div></div>
        <button className="ghost" onClick={() => run(() => ctx.api.buildRelease(kind))}>Build branch now</button>
      </div>
      {list.length === 0 ? <p className="muted">No builds yet. Open a pull request in the repository, edit in the console, or build the branch.</p> : (
        <table>
          <thead><tr><th>#</th><th>Change</th><th>Commit</th><th>Status</th><th>Checks</th><th>Built</th><th /></tr></thead>
          <tbody>{list.map(r => {
            const failed = r.checks.filter(c => !c.ok).length;
            return (
              <tr key={r.id} className={r.id === selected ? "selected clickable" : "clickable"} onClick={() => go(r.id === selected ? base : `${base}/${r.id}`)}>
                <td><strong>{r.number}</strong></td>
                <td><Origin r={r} /></td>
                <td className="mono">{r.revision.slice(0, 7)}</td>
                <td className="nowrap"><span className={`badge ${statusBadge[r.status]}`}>{statusText[r.status]}</span>
                  {r.status === "pending" && <span className="small muted"> {r.approvals.filter(a => a.decision === "approve").length} approved</span>}
                  {r.merge_error && <span className="badge bad" title={r.merge_error} style={{ marginLeft: 4 }}>not merged</span>}</td>
                <td>{r.status === "building" ? "…" : failed ? <span className="del">{failed} failed</span> : r.checks.length ? `${r.checks.length} passed` : ""}</td>
                <td className="nowrap"><Time iso={r.created_at} /></td>
                <td className="nowrap" onClick={e => e.stopPropagation()}>
                  {(r.status === "ready" || r.status === "superseded") && !pending && (
                    <button className="small" onClick={() => run(() => ctx.api.requestRelease(kind, r.id))}>{active && active.number > r.number ? "Request rollback" : "Request activation"}</button>)}
                </td>
              </tr>);
          })}</tbody>
        </table>
      )}
      {selected && <Detail ctx={ctx} kind={kind} id={selected} onChange={rels.reload} />}
    </div>
  );
}

function Origin({ r }: { r: Release }) {
  const label = r.origin === "pr" ? "pull request" : r.origin === "console" ? "console change" : "branch";
  return (
    <span className="small">
      <span className="tag">{label}</span>
      {r.pr_number && (r.pr_url ? <a href={r.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>#{r.pr_number}</a> : <>#{r.pr_number}</>)}{" "}
      {r.title && r.origin !== "branch" && <span>{r.title}</span>}
      {r.origin === "branch" && r.ref && <span className="mono">{r.ref}</span>}
      {r.origin === "console" && <span className="muted"> by {r.created_by}</span>}
    </span>
  );
}

function Detail({ ctx, kind, id, onChange }: { ctx: SectionProps["ctx"]; kind: Kind; id: string; onChange: () => void }) {
  const r = useLoad(() => ctx.api.release(kind, id), [ctx.t.slug, kind, id], 4000);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); setReason(""); r.reload(); onChange(); } catch (e) { setError(e); } };
  if (!r.data) return r.error ? <ErrorBox error={r.error} /> : <Loading />;
  const rel = r.data, m = rel.manifest;
  const me = ctx.me.user.email;
  const devops = has(ctx.t, "devops");
  const decided = rel.approvals.some(a => a.approver === me);
  const own = rel.requested_by === me || (rel.origin === "console" && rel.created_by === me);
  return (
    <div style={{ marginTop: 16 }}>
      <ErrorBox error={error} />
      <h3>Release {rel.number} <span className={`badge ${statusBadge[rel.status]}`}>{statusText[rel.status]}</span> {rel.sha256 && <span className="mono small muted">sha256 {rel.sha256.slice(0, 16)}…</span>}</h3>
      <p className="small"><Origin r={rel} /></p>
      {rel.error && <div className="error">{rel.error}</div>}

      {rel.status === "pending" && (
        <div className="notice">
          <strong>Activation requested</strong> by {rel.requested_by}{rel.requested_at && <> · <Time iso={rel.requested_at} /></>}.
          {rel.pr_number ? <> Activating it merges pull request #{rel.pr_number}.</> : null}
          {rel.approvals.length > 0 && <ul className="small">{rel.approvals.map(a => <li key={a.approver}>{a.decision === "approve" ? "Approved" : "Rejected"} by {a.approver}{a.reason && <>: {a.reason}</>}</li>)}</ul>}
          {devops ? (decided ? <p className="small muted">You already decided.</p> : own ? <p className="small muted">You requested or wrote it; another DevOps engineer approves (or override it on the Approvals page).</p> : (
            <div className="row" style={{ marginTop: 8 }}>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional for approval)" style={{ flex: 1 }} />
              <button onClick={() => act(() => ctx.api.approveRelease(kind, rel.id, reason))}>Approve</button>
              <button className="ghost" onClick={() => act(() => ctx.api.rejectRelease(kind, rel.id, reason))}>Reject</button>
            </div>)) : <p className="small muted">Waiting for DevOps.</p>}
        </div>
      )}
      {rel.status === "active" && rel.pr_number && (
        rel.merge_sha ? <p className="small">Pull request #{rel.pr_number} merged{rel.merge_sha !== "already-merged" && rel.merge_sha !== "merged" ? <> as <span className="mono">{rel.merge_sha.slice(0, 7)}</span></> : null}.</p>
          : <div className="error">Pull request #{rel.pr_number} was not merged{rel.merge_error ? `: ${rel.merge_error}` : ""}. <button className="small" onClick={() => act(() => ctx.api.mergeRelease(kind, rel.id))}>Merge now</button></div>
      )}
      {rel.deployed_at && <p className="small muted">Activated <Time iso={rel.deployed_at} /> ({rel.deployed_by}).</p>}

      <ul className="checks">
        {rel.checks.map(c => (
          <li key={c.name}>
            <span className={`badge ${c.ok ? "ok" : "bad"}`}>{c.ok ? "passed" : "failed"}</span> <strong>{c.name}</strong> {c.detail && <span className="muted small">— {c.detail}</span>}
            {c.errors && c.errors.length > 0 && <ul className="small">{c.errors.map((e, i) => <li key={i} className="mono">{e}</li>)}</ul>}
          </li>
        ))}
      </ul>
      {m?.catalog && (
        <details><summary className="small">{m.catalog.modules.length} kinds · {Object.keys(m.defaults?.kinds ?? {}).length} with {m.tenant} defaults · {Object.keys(m.packages ?? {}).length} vendored packages</summary>
          <table className="small"><thead><tr><th>Package</th><th>Origin</th><th>Files</th><th>Checksum</th></tr></thead>
            <tbody>{Object.entries(m.packages ?? {}).sort().map(([k, p]) => <tr key={k}><td className="mono">{k}</td><td className="mono muted">{p.origin}</td><td>{p.files}</td><td className="mono muted">{p.sha256.slice(0, 12)}</td></tr>)}</tbody></table>
        </details>
      )}
      {m?.policies && (
        <table className="small"><thead><tr><th>Policy set</th><th>Scope</th><th>Level</th><th>Tests</th><th>File</th></tr></thead>
          <tbody>{m.policies.map(p => <tr key={p.name}><td className="mono">{p.name}</td><td>{p.scope}</td><td><span className={`badge ${p.level === "hard" ? "bad" : "wait"}`}>{p.level}</span></td><td>{p.tests || <span className="muted">none</span>}</td><td className="mono muted">{p.file}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}
