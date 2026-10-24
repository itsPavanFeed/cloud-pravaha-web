import { useState } from "react";
import type { Ctx } from "../../App";
import { central, type IntegrationCheck, type WebhookDelivery } from "../../api";
import { Copy, Empty, ErrorBox, Loading, Time, useLoad } from "../../ui";

const randomSecret = () => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
};

export const tone: Record<string, string> = { ok: "ok", warn: "wait", fail: "bad", processed: "ok", ignored: "idle", rejected: "bad" };

// The GitHub tab: app settings, connection test and webhook deliveries, each in
// its own collapsible section. Deliveries load only when their section is open.
export default function GitHubIntegration({ ctx }: { ctx: Ctx }) {
  const gh = useLoad(ctx.api.github, [ctx.t.slug]);
  const auth = useLoad(central.authConfig, []);
  const [form, setForm] = useState<{ app_id: string; installation_id: string; api_url: string; private_key: string; webhook_secret: string } | null>(null);
  const [checks, setChecks] = useState<IntegrationCheck[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);

  if (!gh.data) return gh.error ? <ErrorBox error={gh.error} /> : <Loading />;
  const g = gh.data;
  const f = form ?? {
    app_id: g.config?.app_id ? String(g.config.app_id) : "", installation_id: g.config?.installation_id ? String(g.config.installation_id) : "",
    api_url: g.config?.api_url ?? "", private_key: "", webhook_secret: "",
  };
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p });
  const base = (auth.data?.webhook_base_url || window.location.origin).replace(/\/$/, "");
  const hookURL = base + g.webhook_path;
  const localOnly = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(base);
  const run = async (fn: () => Promise<void>) => {
    setError(null); setBusy(true);
    try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const readKey = (file: File | undefined) => { if (file) file.text().then(t => set({ private_key: t })); };

  return (
    <>
      {error ? <ErrorBox error={error} /> : null}
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0 }}>GitHub App</h2>
            <div className="muted small">Installation tokens read the contracts repository; webhooks start syncs on push. Pull-request plans will use the same app.</div></div>
          {g.configured
            ? <span className="badge ok">connected{g.config?.app_slug ? ` · ${g.config.app_slug}` : ` · app ${g.config?.app_id}`}</span>
            : <span className="badge idle">not connected</span>}
        </div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Webhook URL</dt><dd className="mono">{hookURL} <Copy text={hookURL} />
            {localOnly && <div className="small del">Not reachable from GitHub. Set PRAVAHA_WEBHOOK_BASE_URL (for example your ngrok URL).</div>}</dd>
          <dt>Credentials</dt><dd className="small">private key {g.private_key_set ? "stored" : <span className="del">missing</span>} · webhook secret {g.webhook_secret_set ? "stored" : <span className="del">missing</span>} · {g.source === "env_file" ? <>in <span className="mono">{g.env_file}</span> (hot-reloaded)</> : "sealed in the tenant database"}</dd>
        </dl>
        <div className="row">
          <button className="ghost" disabled={busy || !g.configured} onClick={() => run(async () => setChecks((await ctx.api.testGitHub()).checks))}>Test connection</button>
          {g.configured && <button className="ghost" disabled={busy} onClick={() => run(async () => { if (window.confirm("Remove the GitHub App credentials from this tenant?")) { await ctx.api.deleteGitHub(); setChecks(null); gh.reload(); } })}>Remove</button>}
        </div>
        {checks && (
          <table style={{ marginTop: 14 }}><tbody>{checks.map(c => (
            <tr key={c.name}><td style={{ width: 210 }}><span className={`badge ${tone[c.status]}`}>{c.status}</span> {c.name}</td><td className="small">{c.detail}</td></tr>
          ))}</tbody></table>
        )}
      </div>

      <details className="panel section" open={!g.configured}>
        <summary><h2>{g.configured ? "Change app settings" : "Connect a GitHub App"}</h2></summary>
        <h3>1. Webhook (in the app’s General settings)</h3>
        <p className="muted small">Turn on <strong>Active</strong>, use the webhook URL above, content type JSON, and this secret:</p>
        <div className="row">
          <input type="password" style={{ maxWidth: 420 }} value={f.webhook_secret} placeholder={g.webhook_secret_set ? "stored — enter a new one to replace" : "at least 16 characters"} onChange={e => set({ webhook_secret: e.target.value })} />
          <button type="button" className="ghost small" onClick={() => set({ webhook_secret: randomSecret() })}>Generate</button>
          {f.webhook_secret && <Copy text={f.webhook_secret} />}
        </div>
        <p className="small muted">Permissions &amp; events: Contents read, Metadata read, Pull requests read &amp; write, Checks read &amp; write; events Push, Pull request, Issue comment.</p>
        <h3>2. App credentials</h3>
        <div className="grid">
          <div><label htmlFor="appid">App ID</label><input id="appid" inputMode="numeric" value={f.app_id} placeholder="e.g. 5450441" onChange={e => set({ app_id: e.target.value.trim() })} /></div>
          <div><label htmlFor="inst">Installation ID <span className="muted">(optional)</span></label><input id="inst" inputMode="numeric" value={f.installation_id} placeholder="detected from the contracts repository" onChange={e => set({ installation_id: e.target.value.trim() })} /></div>
          <div><label htmlFor="api">API URL <span className="muted">(GitHub Enterprise Server)</span></label><input id="api" value={f.api_url} placeholder="https://github.example.com/api/v3" onChange={e => set({ api_url: e.target.value.trim() })} /></div>
        </div>
        <label htmlFor="pk">Private key</label>
        <textarea id="pk" rows={4} value={f.private_key} placeholder={g.private_key_set ? "stored — paste or choose a new .pem to replace" : "-----BEGIN RSA PRIVATE KEY----- … (Generate a private key on the app’s General page)"} onChange={e => set({ private_key: e.target.value })} />
        <div className="row" style={{ margin: "6px 0 12px" }}>
          <input type="file" accept=".pem,application/x-pem-file" onChange={e => readKey(e.target.files?.[0])} />
          <span className="muted small">Never shown again after saving.</span>
        </div>
        <button disabled={busy || !form || !f.app_id} onClick={() => run(async () => { await ctx.api.putGitHub(f); setForm(null); gh.reload(); setChecks((await ctx.api.testGitHub()).checks); })}>Save and test</button>
        <h3>3. Contracts repository</h3>
        <p className="muted small">In <a href={`#/t/${ctx.t.slug}/settings`}>Tenant settings → Contracts repository</a>, choose Authentication “GitHub App”.</p>
      </details>

      <details className="panel section" onToggle={e => setShowDeliveries((e.target as HTMLDetailsElement).open)}>
        <summary><h2>Webhook deliveries</h2></summary>
        {showDeliveries && <Deliveries ctx={ctx} />}
      </details>
    </>
  );
}

// Cursor pagination, newest first: "Older" follows next_before, "Newer" goes back.
function Deliveries({ ctx }: { ctx: Ctx }) {
  const [cursors, setCursors] = useState<number[]>([0]);
  const before = cursors[cursors.length - 1];
  const page = useLoad(() => ctx.api.githubDeliveries(before, 20), [ctx.t.slug, before]);
  if (!page.data) return page.error ? <ErrorBox error={page.error} /> : <Loading />;
  const items: WebhookDelivery[] = page.data.items;
  return (
    <>
      {items.length === 0 ? <Empty>No verified deliveries yet. Redeliver one from the app’s Advanced tab, or push to the contracts branch.</Empty> : (
        <table>
          <thead><tr><th>Received</th><th>Event</th><th>Repository</th><th>Outcome</th><th>Detail</th></tr></thead>
          <tbody>{items.map(d => (
            <tr key={d.id}>
              <td className="small"><Time iso={d.received_at} /></td>
              <td className="small mono">{d.event}{d.action ? `.${d.action}` : ""}</td>
              <td className="small">{d.repo}{d.ref ? <span className="muted"> {d.ref.replace("refs/heads/", "")}</span> : null}</td>
              <td><span className={`badge ${tone[d.outcome] ?? "idle"}`}>{d.outcome}</span></td>
              <td className="small">{d.detail}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div className="pager">
        <button className="ghost small" disabled={cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Newer</button>
        <button className="ghost small" onClick={() => page.reload()}>Refresh</button>
        <button className="ghost small" disabled={!page.data.next_before} onClick={() => setCursors([...cursors, page.data!.next_before!])}>Older</button>
      </div>
      <p className="muted small">Only deliveries with a valid signature are recorded; rejected ones appear in GitHub’s log with status 401.</p>
    </>
  );
}
