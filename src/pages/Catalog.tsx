import type { Ctx } from "../App";
import type { CatalogModule } from "../api";
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
        <div><h1>Module catalog</h1>
          <div className="muted">Only these public modules from {data.registry} can be used, at these exact versions. Runs use OpenTofu {data.tofu_version}.</div></div>
      </div>
      {groups.map(g => {
        const mods = data.modules.filter(m => m.cloud === g.cloud);
        const provs = data.providers.filter(p => p.cloud === g.cloud);
        if (!mods.length && !provs.length) return null;
        return (
          <section key={g.title} style={{ marginBottom: 28 }}>
            <h2>{g.title} <span className="muted small">— {mods.length} modules · providers {provs.map(p => <span key={p.source} className="tag">{p.source} {p.version}</span>)}</span></h2>
            <p className="muted small" style={{ marginTop: -6 }}>{g.note}</p>
            <div className="grid">{mods.map(m => <ModuleCard key={m.id} m={m} />)}</div>
          </section>
        );
      })}
    </>
  );
}

function ModuleCard({ m }: { m: CatalogModule }) {
  return (
    <div className="card">
      <h3>{m.title}</h3>
      <div><span className="tag">{m.id}</span><span className="tag">{m.source}</span>{m.versions.map(v => <span key={v} className="tag">v{v}</span>)}</div>
      <p className="small">{m.description}</p>
      <details>
        <summary className="small">Inputs ({m.inputs.length}){m.enforced ? `, enforced baseline (${Object.keys(m.enforced).length})` : ""}</summary>
        <table className="small">
          <tbody>
            {m.inputs.map(i => <tr key={i.name}><td className="mono">{i.name}{i.required && " *"}</td><td className="muted">{i.type}</td></tr>)}
            {m.enforced && Object.entries(m.enforced).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td><span className="badge ok">enforced</span> <span className="mono">{JSON.stringify(v)}</span></td></tr>)}
          </tbody>
        </table>
      </details>
      <a className="small" href={`https://search.opentofu.org/module/${m.source.toLowerCase()}`} target="_blank" rel="noopener noreferrer">Registry page ↗</a>
    </div>
  );
}
