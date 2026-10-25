import { Suspense, useState } from "react";
import type { Ctx } from "../../App";
import { central, has } from "../../api";
import { Copy, Loading, go, useLoad, lazyPage } from "../../ui";

// One section at a time, each its own chunk.
const Organisation = lazyPage(() => import("./Organisation"));
const People = lazyPage(() => import("./People"));
const Contracts = lazyPage(() => import("./Contracts"));
const Risk = lazyPage(() => import("./Risk"));
const Runners = lazyPage(() => import("./Runners"));
const Releases = lazyPage(() => import("./Releases"));

export type Secret = { label: string; value: string } | null;
export type SectionProps = { ctx: Ctx; showSecret: (s: Secret) => void };

type Section = "organisation" | "people" | "contracts" | "releases" | "risk" | "runners";
const sections: { id: Section; title: string; hint: string; admin: boolean }[] = [
  { id: "organisation", title: "Organisation", hint: "Products, business units, environments", admin: false },
  { id: "people", title: "People & roles", hint: "Who can do what, where", admin: true },
  { id: "contracts", title: "Contracts repository", hint: "Stacks from Git", admin: true },
  { id: "releases", title: "Releases", hint: "Modules, defaults, policies", admin: true },
  { id: "risk", title: "Risk policy", hint: "Approvals per risk level", admin: true },
  { id: "runners", title: "Runners", hint: "Where OpenTofu runs", admin: true },
];

export default function Settings({ ctx, section, route }: { ctx: Ctx; section?: string; route?: string[] }) {
  const admin = has(ctx.t, "tenant_admin");
  const visible = sections.filter(s => admin || !s.admin);
  const current = visible.find(s => s.id === section) ?? visible[0];
  const [secret, setSecret] = useState<Secret>(null);
  const health = useLoad(() => (admin ? central.health(ctx.t.slug) : Promise.resolve(null)), [ctx.t.slug]);
  const props: SectionProps = { ctx, showSecret: setSecret };

  return (
    <>
      <div className="head">
        <div><h1>Tenant settings</h1><div className="muted">{ctx.t.name}</div></div>
        {health.data && (health.data.reachable ? <span className="badge ok">backend reachable over mTLS</span> : <span className="badge bad" title={health.data.error}>backend unreachable</span>)}
      </div>
      <nav className="segmented" aria-label="Settings sections">
        {visible.map(s => (
          <button key={s.id} className={s.id === current.id ? "on" : ""} aria-current={s.id === current.id ? "page" : undefined}
            onClick={() => { setSecret(null); go(`t/${ctx.t.slug}/settings/${s.id}`); }}>
            <strong>{s.title}</strong><span>{s.hint}</span>
          </button>
        ))}
      </nav>
      {secret && (
        <div className="notice">
          <strong>{secret.label}</strong> — copy it now; it will not be shown again.
          <div className="row" style={{ marginTop: 8 }}><div className="secret" style={{ flex: 1 }}>{secret.value}</div><Copy text={secret.value} /><button className="ghost small" onClick={() => setSecret(null)}>Done</button></div>
        </div>
      )}
      <Suspense fallback={<Loading />} key={ctx.t.slug + current.id}>
        {current.id === "organisation" && <Organisation {...props} />}
        {current.id === "people" && <People {...props} />}
        {current.id === "contracts" && <Contracts {...props} />}
        {current.id === "risk" && <Risk {...props} />}
        {current.id === "runners" && <Runners {...props} />}
        {current.id === "releases" && <Releases {...props} route={route} />}
      </Suspense>
    </>
  );
}
