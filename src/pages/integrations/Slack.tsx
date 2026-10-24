import { useState } from "react";
import type { Ctx } from "../../App";
import { central } from "../../api";
import { Copy, ErrorBox, Loading, useLoad } from "../../ui";

// Slack: alerts for every notification through an incoming webhook (tenant
// plane), and Approve / Reject buttons through a Slack app whose signing
// secret and bot token live on the central plane, which acts as the clicking user.
export default function SlackIntegration({ ctx }: { ctx: Ctx }) {
  const slug = ctx.t.slug;
  const hook = useLoad(ctx.api.slack, [slug]);
  const appCfg = useLoad(() => central.slackApp(slug), [slug]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setError(null); setMsg(""); try { await fn(); if (ok) setMsg(ok); } catch (e) { setError(e); } };
  if (!hook.data || !appCfg.data) return hook.error || appCfg.error ? <ErrorBox error={hook.error || appCfg.error} /> : <Loading />;
  const h = hook.data, a = appCfg.data;

  return (
    <>
      <ErrorBox error={error} />
      {msg && <div className="notice">{msg}</div>}
      <div className="panel">
        <div className="drill-head">
          <div><h2>Slack alerts</h2><div className="muted small">Every notification (plans waiting for approval, applies, failures, drift, pull requests) is also posted to a Slack channel.</div></div>
          {h.configured ? <span className="badge ok">posting to {h.webhook_host}</span> : <span className="badge idle">not connected</span>}
        </div>
        <label htmlFor="sw">Incoming webhook URL</label>
        <div className="row">
          <input id="sw" type="password" style={{ maxWidth: 520 }} value={url} placeholder={h.configured ? "stored — paste a new one to replace" : "https://hooks.slack.com/services/T…/B…/…"} onChange={e => setUrl(e.target.value.trim())} />
          <button disabled={!url && !h.configured} onClick={() => run(async () => { await ctx.api.putSlack({ webhook_url: url, interactive: a.configured }); setUrl(""); hook.reload(); }, "Slack webhook saved.")}>Save</button>
          {h.configured && <button className="ghost" onClick={() => run(() => ctx.api.testSlack(), "Test message sent — check the channel.")}>Send test message</button>}
          {h.configured && <button className="ghost" onClick={() => run(async () => { if (window.confirm("Stop sending notifications to Slack?")) { await ctx.api.deleteSlack(); hook.reload(); } })}>Remove</button>}
        </div>
        <p className="muted small">In your Slack app: Incoming Webhooks → Activate → Add New Webhook to Workspace, choose the channel, and paste the URL here. {h.source === "env_file" ? "Saved to the env file (PRAVAHA_SLACK_WEBHOOK_URL)." : "Sealed in the tenant database."}</p>
      </div>

      <div className="panel">
        <div className="drill-head">
          <div><h2>Approve and reject from Slack</h2><div className="muted small">Approval requests get Approve / Reject buttons. Clicks are checked against Slack’s signature and performed as the Cloud Pravaha user with the same email — same roles, same separation of duties, same audit trail.</div></div>
          {a.configured ? <span className="badge ok">enabled</span> : <span className="badge idle">off</span>}
        </div>
        <ol className="small steps-list">
          <li>Slack app → <strong>Interactivity &amp; Shortcuts</strong> → on, Request URL: <span className="mono">{a.interactivity_url}</span> <Copy text={a.interactivity_url} /></li>
          <li><strong>OAuth &amp; Permissions</strong> → Bot token scopes <span className="mono">users:read</span> and <span className="mono">users:read.email</span> → reinstall, copy the Bot User OAuth Token.</li>
          <li><strong>Basic Information</strong> → copy the Signing Secret.</li>
        </ol>
        <div className="grid">
          <div><label htmlFor="ss">Signing secret</label><input id="ss" type="password" value={secret} placeholder={a.configured ? "stored — enter to replace" : ""} onChange={e => setSecret(e.target.value.trim())} /></div>
          <div><label htmlFor="bt">Bot token</label><input id="bt" type="password" value={token} placeholder={a.configured ? "stored — enter to replace" : "xoxb-…"} onChange={e => setToken(e.target.value.trim())} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button disabled={!secret || !token} onClick={() => run(async () => {
            await central.putSlackApp(slug, { signing_secret: secret, bot_token: token });
            if (h.configured) await ctx.api.putSlack({ webhook_url: "", interactive: true });
            setSecret(""); setToken(""); appCfg.reload(); hook.reload();
          }, "Slack app saved; approval messages now carry buttons.")}>Save</button>
          {a.configured && <button className="ghost" onClick={() => run(async () => {
            if (!window.confirm("Remove the Slack app? Messages keep coming, without buttons.")) return;
            await central.deleteSlackApp(slug);
            if (h.configured) await ctx.api.putSlack({ webhook_url: "", interactive: false });
            appCfg.reload(); hook.reload();
          })}>Remove</button>}
        </div>
        <p className="muted small">The signing secret and bot token are sealed on the central plane and never shown again. The Request URL must be reachable from Slack (your public webhook address).</p>
      </div>
    </>
  );
}
