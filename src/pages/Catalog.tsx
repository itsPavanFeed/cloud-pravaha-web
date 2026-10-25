import type { Ctx } from "../App";
import type { CatalogModule, KindDefaults } from "../api";
import { ErrorBox, Loading, useLoad } from "../ui";

const groups: { cloud: string; title: string; note: string }[] = [
  { cloud: "aws", title: "AWS", note: "Use in environments with provider aws." },
  { cloud: "gcp", title: "Google Cloud", note: "Use in environments with provider gcp." },
  { cloud: "azure", title: "Azure", note: "Use in environments with provider azure." },
  { cloud: "", title: "Common", note: "Need no cloud credentials; usable in any environment." },
];

export default function CatalogPage({ ctx }: { ctx: Ctx }) {
  const { data, error } = useLoad(ctx.api.catalog, [ctx.t.slug]);
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="head">
        <div><h1>Kinds</h1>
          <div className="muted">Every resource is one of these kinds: a public module from {data.registry} at pinned versions, with {ctx.t.name}’s defaults. Contracts set only what differs. Runs use OpenTofu {data.tofu_version}.</div></div>
        {data.release ? <span className="badge ok" title={`sha256 ${data.release.sha256}`}>module release {data.release.number} deployed</span> : <span className="badge idle">bundled catalog (no release deployed)</span>}
      </div>
      {groups.map(g => {
        const mods = data.modules.filter(m => m.cloud === g.cloud);
        const provs = data.providers.filter(p => p.cloud === g.cloud);
        if (!mods.length && !provs.length) return null;
        return (
          <section key={g.title} style={{ marginBottom: 28 }}>
            <h2>{g.title} <span className="muted small">— {mods.length} kinds · providers {provs.map(p => <span key={p.source} className="tag">{p.source} {p.version}</span>)}</span></h2>
            <p className="muted small" style={{ marginTop: -6 }}>{g.note}</p>
            <div className="grid">{mods.map(m => <ModuleCard key={m.id} m={m} d={data.defaults?.[m.kind]} tenant={ctx.t.name} />)}</div>
          </section>
        );
      })}
    </>
  );
}

function ModuleCard({ m, d, tenant }: { m: CatalogModule; d?: KindDefaults; tenant: string }) {
  const tenantVal = (name: string) => {
    const parts: string[] = [];
    if (d?.spec?.[name] !== undefined) parts.push(JSON.stringify(d.spec[name]));
    for (const [tier, vals] of Object.entries(d?.tiers ?? {})) if (vals[name] !== undefined) parts.push(`${tier}: ${JSON.stringify(vals[name])}`);
    return parts.join(" · ");
  };
  return (
    <div className="card">
      <h3>{m.title}</h3>
      <div><span className="tag">kind: {m.kind}</span><span className="tag">{m.source}</span>{m.versions.map(v => <span key={v} className="tag">v{v}</span>)}</div>
      <p className="small">{m.description}</p>
      {d && <p className="small"><span className="badge ok">{tenant} defaults</span> {Object.keys(d.spec ?? {}).length + Object.values(d.tiers ?? {}).reduce((n, t) => n + Object.keys(t).length, 0)} values{d.version ? `, version ${d.version}` : ""}</p>}
      <details>
        <summary className="small">Inputs ({m.inputs.length}){m.enforced ? `, enforced baseline (${Object.keys(m.enforced).length})` : ""}</summary>
        <table className="small">
          <thead><tr><th>Input</th><th>Type</th><th>Kind default</th><th>{tenant}</th></tr></thead>
          <tbody>
            {m.inputs.map(i => <tr key={i.name}><td className="mono">{i.name}{i.required && " *"}{i.sensitive && <> <span className="badge wait">secretRef</span></>}</td><td className="muted">{i.type}</td>
              <td className="mono muted">{i.default === undefined ? "" : JSON.stringify(i.default)}</td><td className="mono">{tenantVal(i.name)}</td></tr>)}
            {m.enforced && Object.entries(m.enforced).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td colSpan={3}><span className="badge ok">enforced</span> <span className="mono">{JSON.stringify(v)}</span></td></tr>)}
          </tbody>
        </table>
      </details>
      <a className="small" href={`https://search.opentofu.org/module/${m.source.toLowerCase()}`} target="_blank" rel="noopener noreferrer">Registry page ↗</a>
    </div>
  );
}
