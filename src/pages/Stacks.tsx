import { useState } from "react";
import { inScope, type Ctx } from "../App";
import { writableBUs } from "../api";
import { Empty, ErrorBox, Link, Loading, Pager, Status, Time, useLoad } from "../ui";

const PAGE = 20;
const waiting = new Set(["queued", "planning", "planned", "apply_queued", "applying"]);
const failed = new Set(["failed", "policy_failed", "drifted"]);

export default function Stacks({ ctx }: { ctx: Ctx }) {
  const { data, error } = useLoad(ctx.api.stacks, [ctx.t.slug], 10000);
  const [q, setQ] = useState("");
  const [state, setState] = useState<"" | "active" | "attention" | "never">("");
  const [offset, setOffset] = useState(0);
  const base = `t/${ctx.t.slug}/`;
  const all = (data ?? []).filter(s => inScope(ctx, s.bu, s.entity));
  const rows = all.filter(s => {
    if (q && !`${s.name} ${s.bu} ${s.entity} ${s.environment} ${s.spec.modules.map(m => `${m.kind ?? ""} ${m.module ?? ""}`).join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
    const st = s.last_run?.status;
    if (state === "active") return !!st && waiting.has(st);
    if (state === "attention") return !!st && failed.has(st);
    if (state === "never") return !st;
    return true;
  });
  const page = rows.slice(offset, offset + PAGE);
  const filter = (f: typeof state) => { setState(f); setOffset(0); };

  return (
    <>
      <div className="head">
        <div><h1>Stacks</h1><div className="muted">{ctx.t.name} · each stack is one state file built only from approved public modules.</div></div>
        {writableBUs(ctx.t).length > 0 && <Link to={base + "stacks/new"}><button>New stack</button></Link>}
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : all.length === 0 ? (
        <Empty>No stacks yet.{writableBUs(ctx.t).length > 0 ? " Create one with New stack." : ""}</Empty>
      ) : (
        <>
          <div className="toolbar">
            <input type="search" placeholder="Search name, business unit, environment or kind" value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} />
            <div className="chips" role="tablist" aria-label="Filter">
              {([["", "All"], ["active", "In progress"], ["attention", "Needs attention"], ["never", "Never run"]] as const).map(([k, label]) => (
                <button key={k || "all"} role="tab" aria-selected={state === k} className={state === k ? "chip on" : "chip"} onClick={() => filter(k)}>{label}</button>
              ))}
            </div>
          </div>
          {rows.length === 0 ? <Empty>No stacks match.</Empty> : (
            <div className="panel" style={{ padding: 0 }}>
              <table className="stacks-table">
                <thead><tr><th>Stack</th><th>Product / business unit</th><th>Environment</th><th>Resources</th><th>Last run</th><th>Updated</th></tr></thead>
                <tbody>{page.map(s => (
                  <tr key={s.id}>
                    <td className="nowrap"><Link to={`${base}stacks/${s.id}`}>{s.name}</Link>
                      {s.managed_by === "git" && <span className="badge idle" title={s.source_ref}>git</span>}
                      {s.pr_number && <span className="badge busy">proposed in #{s.pr_number}</span>}</td>
                    <td className="nowrap"><span className="muted">{s.entity} /</span> {s.bu}</td>
                    <td className="nowrap">{s.environment}</td>
                    <td>{s.spec.modules.map(m => <span key={m.name} className="tag" title={m.module}>{m.kind ?? m.module}</span>)}</td>
                    <td className="nowrap">{s.last_run ? <Link to={`${base}runs/${s.last_run.id}`}><Status s={s.last_run.status} /></Link> : <span className="muted">never</span>}</td>
                    <td className="nowrap"><Time iso={s.updated_at} /></td>
                  </tr>))}
                </tbody>
              </table>
              <div style={{ padding: "0 12px 10px" }}><Pager offset={offset} limit={PAGE} total={rows.length} onPage={setOffset} /></div>
            </div>
          )}
        </>
      )}
    </>
  );
}
