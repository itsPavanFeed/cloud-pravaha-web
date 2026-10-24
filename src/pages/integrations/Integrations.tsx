import { Suspense, lazy } from "react";
import type { Ctx } from "../../App";
import { has } from "../../api";
import { ErrorBox, Loading, go, useLoad } from "../../ui";

// Each tab is its own chunk, fetched (with its data) only when opened.
const GitHub = lazy(() => import("./GitHub"));
const Cloud = lazy(() => import("./Cloud"));

type Tab = "github" | "cloud";
type Provider = "" | "aws" | "gcp" | "azure";

// Routes: integrations/github, integrations/cloud[/aws|gcp|azure].
export default function Integrations({ ctx, route }: { ctx: Ctx; route: string[] }) {
  const admin = has(ctx.t, "tenant_admin");
  const tab: Tab = route[0] === "github" && admin ? "github" : route[0] === "cloud" || !admin ? "cloud" : "github";
  const provider = (["aws", "gcp", "azure"].includes(route[1]) ? route[1] : "") as Provider;
  const base = `t/${ctx.t.slug}/integrations`;

  return (
    <>
      <div className="head"><div><h1>Integrations</h1>
        <div className="muted">{ctx.t.name}’s connections to Git and to clouds. Everything here belongs to this tenant only and is stored in its own backend.</div></div></div>

      <div className="tabs" role="tablist" aria-label="Integration type">
        {admin && <TabButton on={tab === "github"} onClick={() => go(`${base}/github`)} title="GitHub"><GitHubSummary ctx={ctx} /></TabButton>}
        <TabButton on={tab === "cloud"} onClick={() => go(`${base}/cloud`)} title="Cloud (AWS · GCP · Azure)"><CloudSummary ctx={ctx} /></TabButton>
      </div>

      {/* keyed by tenant so nothing carries over when the tenant changes */}
      <Suspense fallback={<Loading />} key={ctx.t.slug}>
        {tab === "github"
          ? <GitHub ctx={ctx} />
          : <Cloud ctx={ctx} provider={provider} setProvider={p => go(`${base}/cloud${p ? "/" + p : ""}`)} />}
      </Suspense>
    </>
  );
}

function TabButton({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={on} className={on ? "tab on" : "tab"} onClick={onClick}>
      <strong>{title}</strong>
      <span className="small muted">{children}</span>
    </button>
  );
}

// Light summaries for the tab headers: one small request each.
function GitHubSummary({ ctx }: { ctx: Ctx }) {
  const g = useLoad(ctx.api.github, [ctx.t.slug]);
  if (g.error) return <>unavailable</>;
  if (!g.data) return <>…</>;
  return <>{g.data.configured ? `connected${g.data.config?.app_slug ? " · " + g.data.config.app_slug : ""}` : "not connected"}</>;
}

function CloudSummary({ ctx }: { ctx: Ctx }) {
  const c = useLoad(() => ctx.api.connectionsPage("", 1, 0), [ctx.t.slug]);
  if (c.error) return <ErrorBox error={c.error} />;
  if (!c.data) return <>…</>;
  const n = c.data.counts;
  return <>AWS {n.aws ?? 0} · GCP {n.gcp ?? 0} · Azure {n.azure ?? 0}</>;
}
