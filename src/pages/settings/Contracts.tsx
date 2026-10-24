import { useState } from "react";
import type { ContractsConfig } from "../../api";
import { ErrorBox, Loading, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const blank: ContractsConfig = { provider: "github", repo: "", branch: "main", path: "stacks", layout: "nested", poll_seconds: 60, auto_plan: true, auto_apply_low_risk: false, enabled: false };

export default function Contracts({ ctx }: SectionProps) {
  const slug = ctx.t.slug;
  const contracts = useLoad(ctx.api.contracts, [slug], 15000);
  const [cc, setCc] = useState<ContractsConfig | null>(null);
  const [gitToken, setGitToken] = useState("");
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  if (!contracts.data) return contracts.error ? <ErrorBox error={contracts.error} /> : <Loading />;
  const saved = contracts.data.config;
  const editing = cc !== null || !saved;
  const v = cc ?? saved ?? blank;
  const st = contracts.data.status;
  const example = (v.layout ?? "flat") === "nested" ? `${v.path || "."}/retail/payments/payments-prod/api.json` : `${v.path || "."}/api.json  (with "environment": "payments-prod")`;

  return (
    <>
      <ErrorBox error={error} />
      <div className="panel">
        <div className="drill-head">
          <div><h2>Contracts repository</h2><div className="muted small">One JSON file per stack. The tenant plane pulls the branch, creates or updates Git-managed stacks and queues plans; approvals still apply.</div></div>
          {saved && !editing && <div className="row">
            <button className="ghost" onClick={() => run(async () => { await ctx.api.syncContracts(); contracts.reload(); })}>Sync now</button>
            <button onClick={() => setCc(saved)}>Edit</button></div>}
        </div>
        {!editing && saved ? (
          <dl className="kv">
            <dt>Repository</dt><dd className="mono">{saved.provider}: {saved.repo} @ {saved.branch}</dd>
            <dt>Folder layout</dt><dd className="mono">{saved.layout === "nested" ? `${saved.path}/<product>/<business unit>/<environment>/<stack>.json` : `${saved.path}/<stack>.json`}</dd>
            <dt>Authentication</dt><dd>{saved.auth === "github_app" ? "GitHub App" : contracts.data.token_set ? "access token (stored)" : <span className="del">no token</span>}</dd>
            <dt>Automation</dt><dd>{saved.enabled ? `polls every ${saved.poll_seconds}s` : "polling off (webhook or manual sync)"} · {saved.auto_plan ? "plans changes" : "no automatic plans"} · {saved.auto_apply_low_risk ? "auto-applies low risk" : "every apply approved"}</dd>
          </dl>
        ) : (
          <>
            <div className="grid">
              <div><label>Provider</label><select value={v.provider} onChange={e => setCc({ ...v, provider: e.target.value as ContractsConfig["provider"] })}><option value="github">GitHub</option><option value="gitlab">GitLab</option></select></div>
              <div><label>Repository</label><input value={v.repo} placeholder="acme/infra-contracts" onChange={e => setCc({ ...v, repo: e.target.value })} /></div>
              <div><label>Branch</label><input value={v.branch} onChange={e => setCc({ ...v, branch: e.target.value })} /></div>
              <div><label>Folder</label><input value={v.path} onChange={e => setCc({ ...v, path: e.target.value })} /></div>
              <div><label>Layout</label><select value={v.layout ?? "flat"} onChange={e => setCc({ ...v, layout: e.target.value as ContractsConfig["layout"] })}>
                <option value="nested">product / business unit / environment folders</option><option value="flat">flat (environment inside each file)</option></select></div>
              {v.provider === "github" && <div><label>Authentication</label><select value={v.auth ?? "token"} onChange={e => setCc({ ...v, auth: e.target.value as ContractsConfig["auth"] })}>
                <option value="token">Access token</option><option value="github_app">GitHub App (Integrations)</option></select></div>}
              <div><label>API URL <span className="muted">(GitHub Enterprise / self-hosted GitLab)</span></label><input value={v.api_url ?? ""} onChange={e => setCc({ ...v, api_url: e.target.value || undefined })} /></div>
              <div><label>Poll every (seconds)</label><input type="number" min={30} value={v.poll_seconds} onChange={e => setCc({ ...v, poll_seconds: Number(e.target.value) })} /></div>
            </div>
            <p className="small muted">Example path: <span className="mono">{example}</span></p>
            <div className="row" style={{ margin: "10px 0" }}>
              <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.enabled} onChange={e => setCc({ ...v, enabled: e.target.checked })} /> poll the branch</label>
              <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.auto_plan} onChange={e => setCc({ ...v, auto_plan: e.target.checked })} /> plan changed contracts automatically</label>
              <label className="row small" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={v.auto_apply_low_risk} onChange={e => setCc({ ...v, auto_apply_low_risk: e.target.checked })} /> auto-apply low-risk plans</label>
            </div>
            {(v.auth ?? "token") === "token" || v.provider !== "github" ? (
              <div className="row" style={{ marginBottom: 10 }}>
                <input type="password" style={{ maxWidth: 300 }} placeholder={contracts.data.token_set ? "token stored — enter to replace" : "read-only access token"} value={gitToken} onChange={e => setGitToken(e.target.value)} />
                <button className="ghost" disabled={!gitToken} onClick={() => run(async () => { await ctx.api.putContractsToken(gitToken); setGitToken(""); contracts.reload(); })}>Save token</button>
              </div>
            ) : <p className="muted small">Uses the <a href={`#/t/${slug}/integrations/github`}>GitHub App</a> installation.</p>}
            <div className="row">
              <button onClick={() => run(async () => { await ctx.api.putContracts(v); setCc(null); contracts.reload(); })}>Save</button>
              {saved && <button className="ghost" onClick={() => setCc(null)}>Cancel</button>}
            </div>
          </>
        )}
      </div>

      {st?.revision && (
        <details className="panel section">
          <summary><h2>Last sync</h2> <span className="small muted"><span className="mono">{st.revision.slice(0, 7)}</span> · {new Date(st.synced_at).toLocaleString()}{st.error && <span className="del"> — {st.error}</span>}</span></summary>
          <table><tbody>{(st.results ?? []).map((r, i) => (
            <tr key={i}><td className="mono small">{r.stack ?? r.file}</td>
              <td><span className={`badge ${r.action === "error" ? "bad" : r.action === "orphaned" || r.action === "waiting" ? "wait" : r.action === "unchanged" ? "idle" : "ok"}`}>{r.action}</span></td>
              <td className="small">{r.run_id ? <a href={`#/t/${slug}/runs/${r.run_id}`}>run {r.run_id.slice(0, 8)}</a> : r.error}</td></tr>))}
          </tbody></table>
        </details>
      )}
    </>
  );
}
