import { useState } from "react";
import type { Ctx } from "../App";
import type { Catalog, CatalogInput, CatalogModule, KindDefaults } from "../api";
import { Copy, ErrorBox, Loading, go, useLoad } from "../ui";

type Provider = "aws" | "gcp" | "azure" | "common";
const providers: { id: Provider; cloud: string; title: string; note: string }[] = [
  { id: "aws", cloud: "aws", title: "AWS", note: "Used in environments connected to an AWS account." },
  { id: "gcp", cloud: "gcp", title: "Google Cloud", note: "Used in environments connected to a GCP project." },
  { id: "azure", cloud: "azure", title: "Azure", note: "Used in environments connected to an Azure subscription." },
  { id: "common", cloud: "", title: "Common", note: "Need no cloud credentials; usable in any environment." },
];

// Routes: catalog[/<provider>[/<Kind>]].
export default function CatalogPage({ ctx, route }: { ctx: Ctx; route: string[] }) {
  const { data, error } = useLoad(ctx.api.catalog, [ctx.t.slug]);
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  const base = `t/${ctx.t.slug}/catalog`;
  const provider = providers.find(p => p.id === route[0]) ?? providers[0];
  const kinds = data.modules.filter(m => m.cloud === provider.cloud).sort((a, b) => a.kind.localeCompare(b.kind));
  const selected = route[1] ? data.modules.find(m => m.kind === route[1] && m.cloud === provider.cloud) : undefined;

  return (
    <>
      <div className="head">
        <div><h1>Kinds</h1>
          <div className="muted">Every resource is one of these kinds: a public module from {data.registry}, pinned and hardened. Contracts set only what differs from the defaults.</div></div>
        {data.release
          ? <span className="badge ok" title={`sha256 ${data.release.sha256}`}>module release {data.release.number}</span>
          : <span className="badge idle">bundled catalog</span>}
      </div>

      <nav className="tabs compact" role="tablist" aria-label="Cloud provider">
        {providers.map(p => {
          const n = data.modules.filter(m => m.cloud === p.cloud).length;
          return (
            <button key={p.id} role="tab" aria-selected={p.id === provider.id} className={p.id === provider.id ? "tab on" : "tab"} onClick={() => go(`${base}/${p.id}`)}>
              <strong>{p.title}</strong><span className="small muted">{n} {n === 1 ? "kind" : "kinds"}</span>
            </button>
          );
        })}
      </nav>

      {route[1] && !selected ? <ErrorBox error={new Error(`No ${provider.title} kind named ${route[1]}.`)} />
        : selected ? <KindDetail m={selected} data={data} tenant={ctx.t.name} back={() => go(`${base}/${provider.id}`)} providerTitle={provider.title} />
        : <KindList kinds={kinds} data={data} note={provider.note} href={m => `#/${base}/${provider.id}/${m.kind}`} />}
    </>
  );
}

function KindList({ kinds, data, note, href }: { kinds: CatalogModule[]; data: Catalog; note: string; href: (m: CatalogModule) => string }) {
  const [q, setQ] = useState("");
  const shown = kinds.filter(m => !q || `${m.kind} ${m.title} ${m.source}`.toLowerCase().includes(q.toLowerCase()));
  const provs = data.providers.filter(p => kinds.some(m => m.providers.includes(p.source)));
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="toolbar" style={{ padding: "12px 14px 0" }}>
        <input type="search" placeholder="Search kinds" value={q} onChange={e => setQ(e.target.value)} />
        <span className="small muted">{note}{provs.length > 0 && <> Providers: {provs.map(p => <span key={p.source} className="tag">{p.source} {p.version}</span>)}</>}</span>
      </div>
      {shown.length === 0 ? <p className="muted" style={{ padding: 14 }}>No kinds match.</p> : (
        <table className="stacks-table">
          <thead><tr><th>Kind</th><th>Description</th><th>Module</th><th>Versions</th><th>Defaults</th></tr></thead>
          <tbody>{shown.map(m => (
            <tr key={m.id} className="clickable" onClick={() => { location.hash = href(m); }}>
              <td className="nowrap"><a href={href(m)}><strong>{m.kind}</strong></a></td>
              <td>{m.title}</td>
              <td className="mono small muted">{m.source}</td>
              <td className="nowrap">{m.versions.join(", ")}</td>
              <td>{data.defaults?.[m.kind] ? <span className="badge ok">tenant defaults</span> : <span className="muted small">kind only</span>}</td>
            </tr>))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function tenantValues(inp: CatalogInput, d?: KindDefaults): { all?: unknown; tiers: [string, unknown][] } {
  return {
    all: d?.spec?.[inp.name],
    tiers: Object.entries(d?.tiers ?? {}).filter(([, v]) => v[inp.name] !== undefined).map(([t, v]) => [t, v[inp.name]]),
  };
}

const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function KindDetail({ m, data, tenant, back, providerTitle }: { m: CatalogModule; data: Catalog; tenant: string; back: () => void; providerTitle: string }) {
  const d = data.defaults?.[m.kind];
  const latest = d?.version ?? m.versions[m.versions.length - 1];
  const needed = m.inputs.filter(i => i.required && tenantValues(i, d).all === undefined && i.default === undefined);
  const example = [
    "apiVersion: pravaha/v1",
    `kind: ${m.kind}`,
    "metadata:",
    `  name: my-${m.kind.toLowerCase()}`,
    ...(needed.length ? ["spec:", ...needed.flatMap(i => i.sensitive ? [`  ${i.name}:`, "    secretRef: vault://kv/<path>#<key>"] : [`  ${i.name}: <${i.type}>`])] : []),
  ].join("\n");

  return (
    <>
      <p className="small"><button className="link" onClick={back}>← {providerTitle} kinds</button></p>
      <div className="panel">
        <div className="drill-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>{m.kind} <span className="muted small">{m.title}</span></h2>
            <div className="muted small">{m.description}</div>
          </div>
          <a className="small" href={`https://search.opentofu.org/module/${m.source.split("//")[0].toLowerCase()}`} target="_blank" rel="noopener noreferrer">Registry page ↗</a>
        </div>
        <dl className="kv">
          <dt>Module</dt><dd className="mono">{m.source}</dd>
          <dt>Versions</dt><dd>{m.versions.map(v => <span key={v} className="tag">{v}{v === latest ? " (default)" : ""}</span>)}</dd>
          <dt>Providers</dt><dd>{m.providers.length ? m.providers.map(p => <span key={p} className="tag">{p} {data.providers.find(x => x.source === p)?.version}</span>) : <span className="muted">none</span>}</dd>
          <dt>{tenant} defaults</dt><dd>{d ? <>yes{d.file && <span className="mono small muted"> · {d.file}</span>}</> : <span className="muted">none; the kind's defaults apply</span>}</dd>
        </dl>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <h3 style={{ padding: "12px 14px 0" }}>Inputs</h3>
        <p className="small muted" style={{ padding: "0 14px" }}>What a contract may set. Empty values fall back to the {tenant} default, then the kind default.</p>
        <table>
          <thead><tr><th>Input</th><th>Type</th><th>Kind default</th><th>{tenant} default</th><th>Description</th></tr></thead>
          <tbody>{m.inputs.map(i => {
            const tv = tenantValues(i, d);
            return (
              <tr key={i.name}>
                <td className="nowrap"><span className="mono">{i.name}</span>
                  {i.required && <span className="badge wait" style={{ marginLeft: 6 }}>required</span>}
                  {i.sensitive && <span className="badge bad" style={{ marginLeft: 6 }}>secretRef only</span>}</td>
                <td className="mono small">{i.type}</td>
                <td className="mono small">{i.default === undefined ? <span className="muted">—</span> : fmt(i.default)}</td>
                <td className="mono small">
                  {tv.all === undefined && tv.tiers.length === 0 ? <span className="muted">—</span> : <>
                    {tv.all !== undefined && <div>{fmt(tv.all)}</div>}
                    {tv.tiers.map(([t, v]) => <div key={t}><span className="muted">{t}:</span> {fmt(v)}</div>)}
                  </>}
                </td>
                <td className="small">{i.description}
                  {(i.pattern || i.allowed || i.min !== undefined || i.max !== undefined) && (
                    <div className="muted mono">{i.allowed ? `one of ${i.allowed.map(String).join(", ")}` : ""}{i.pattern ? `pattern ${i.pattern}` : ""}{i.min !== undefined ? ` min ${i.min}` : ""}{i.max !== undefined ? ` max ${i.max}` : ""}</div>)}
                </td>
              </tr>);
          })}</tbody>
        </table>
      </div>

      {m.enforced && Object.keys(m.enforced).length > 0 && (
        <div className="panel" style={{ padding: 0 }}>
          <h3 style={{ padding: "12px 14px 0" }}>Enforced baseline</h3>
          <p className="small muted" style={{ padding: "0 14px" }}>Always set by the platform. No contract or default can change these.</p>
          <table><tbody>{Object.entries(m.enforced).map(([k, v]) => (
            <tr key={k}><td className="mono nowrap">{k}</td><td className="mono small">{fmt(v)}</td></tr>))}</tbody></table>
        </div>
      )}

      <div className="kind-foot">
        <div className="panel">
          <h3>Outputs</h3>
          <p className="small muted">Other resources reference these with <span className="mono">ref: &lt;name&gt;.&lt;output&gt;</span>.</p>
          {m.outputs.length ? m.outputs.map(o => <span key={o} className="tag mono">{o}</span>) : <span className="muted">none</span>}
        </div>
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Minimal contract</h3><Copy text={example} /></div>
          <pre className="code">{example}</pre>
        </div>
      </div>
    </>
  );
}
