import { useState } from "react";
import type { Release, ReleaseSource } from "../../api";
import { ErrorBox, Loading, Time, go, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

type Kind = "modules" | "policies";

const blank = (kind: Kind): ReleaseSource => ({ provider: "github", repo: "", branch: "main", path: kind === "policies" ? "policies" : "", poll_seconds: 300, enabled: false, auto_deploy: false });

const statusBadge: Record<Release["status"], string> = { building: "busy", failed: "bad", ready: "wait", active: "ok", superseded: "idle" };

const intro: Record<Kind, { title: string; text: string; layout: string }> = {
  modules: {
    title: "Module releases",
    text: "Builds the modules repository into a release: kinds are validated, this tenant's defaults are checked, every module is vendored from the registry pinned to a commit, nested modules are pinned to approved versions, and kinds are checked against their modules. Runs use only the deployed release.",
    layout: "catalog/providers/<cloud>.yaml · catalog/modules/<cloud>/<kind>.yaml · tenants/<tenant>/defaults/<Kind>.yaml",
  },
  policies: {
    title: "Policy releases",
    text: "Builds the policies repository into a release: every Rego set compiles and its tests pass, or nothing is deployed. Deployed sets apply by scope and are read-only in the console.",
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
          <dt>Automation</dt><dd>{saved.enabled ? `builds new commits (push webhook, or polling every ${saved.poll_seconds}s)` : "builds on request only"} · {saved.auto_deploy ? "deploys successful builds automatically" : "a tenant admin deploys each release"}</dd>
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
            <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.enabled} onChange={e => setEdit({ ...v, enabled: e.target.checked })} /> build new commits automatically</label>
            <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.auto_deploy} onChange={e => setEdit({ ...v, auto_deploy: e.target.checked })} /> deploy successful builds automatically</label>
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
  const building = list.some(r => r.status === "building");
  return (
    <div className="panel">
      <ErrorBox error={error} />
      <div className="drill-head">
        <div><h2>Releases</h2>
          <div className="muted small">
            {active ? <>Release <strong>{active.number}</strong> is deployed (from {active.revision.slice(0, 7)}).</> :
              kind === "modules" ? <>No release deployed: stacks use the catalog bundled with the platform{rels.data.bundled ? ` (${rels.data.bundled.kinds} kinds)` : ""}.</> : <>No policy release deployed.</>}
            {cache.data && <> Bundle cache: {cache.data.memory_hits + cache.data.disk_hits} hits, {cache.data.origin_loads} reads from storage.</>}
          </div></div>
        <button disabled={building} onClick={() => run(() => ctx.api.buildRelease(kind))}>{building ? "Building…" : "Build now"}</button>
      </div>
      {list.length === 0 ? <p className="muted">No builds yet. Configure the source and build.</p> : (
        <table>
          <thead><tr><th>#</th><th>Commit</th><th>Status</th><th>Checks</th><th>Size</th><th>Built</th><th>Deployed</th><th /></tr></thead>
          <tbody>{list.map(r => {
            const failed = r.checks.filter(c => !c.ok).length;
            return (
              <tr key={r.id} className={r.id === selected ? "selected" : ""}>
                <td><button className="link" onClick={() => go(r.id === selected ? base : `${base}/${r.id}`)}>{r.number}</button></td>
                <td className="mono">{r.revision.slice(0, 7)}</td>
                <td><span className={`badge ${statusBadge[r.status]}`}>{r.status}</span></td>
                <td>{r.status === "building" ? "…" : failed ? <span className="del">{failed} failed</span> : `${r.checks.length} passed`}</td>
                <td className="nowrap">{r.size ? `${(r.size / 1048576).toFixed(1)} MiB` : ""}</td>
                <td className="nowrap"><Time iso={r.created_at} /> <span className="muted small">{r.created_by}</span></td>
                <td className="nowrap">{r.deployed_at ? <><Time iso={r.deployed_at} /> <span className="muted small">{r.deployed_by}</span></> : ""}</td>
                <td className="nowrap">{(r.status === "ready" || r.status === "superseded") && (
                  <button className="small" onClick={() => run(() => ctx.api.deployRelease(kind, r.id))}>{active && active.number > r.number ? "Roll back to this" : "Deploy"}</button>)}</td>
              </tr>);
          })}</tbody>
        </table>
      )}
      {selected && <Detail ctx={ctx} kind={kind} id={selected} />}
    </div>
  );
}

function Detail({ ctx, kind, id }: { ctx: SectionProps["ctx"]; kind: Kind; id: string }) {
  const r = useLoad(() => ctx.api.release(kind, id), [ctx.t.slug, kind, id], 4000);
  if (!r.data) return r.error ? <ErrorBox error={r.error} /> : <Loading />;
  const rel = r.data, m = rel.manifest;
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Release {rel.number} {rel.sha256 && <span className="mono small muted">sha256 {rel.sha256.slice(0, 16)}…</span>}</h3>
      {rel.error && <div className="error">{rel.error}</div>}
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
