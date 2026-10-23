import { inScope, type Ctx } from "../App";
import type { Run } from "../api";
import { Empty, ErrorBox, Link, Loading, RiskBadge, Status, Time, useLoad } from "../ui";

export default function Runs({ ctx }: { ctx: Ctx }) {
  const { data, error } = useLoad(ctx.api.runs, [ctx.t.slug], 4000);
  const rows = (data ?? []).filter(r => inScope(ctx, r.bu, r.entity));
  const waiting = rows.filter(r => r.status === "planned");
  return (
    <>
      <div className="head"><div><h1>Runs</h1><div className="muted">Every plan and apply, newest first.{waiting.length > 0 && ` ${waiting.length} awaiting approval.`}</div></div></div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : rows.length === 0 ? <Empty>No runs yet.</Empty> : <RunTable ctx={ctx} runs={rows} />}
    </>
  );
}

export function RunTable({ ctx, runs, showStack = true }: { ctx: Ctx; runs: Run[]; showStack?: boolean }) {
  const base = `t/${ctx.t.slug}/`;
  return (
    <div className="panel" style={{ padding: 0 }}>
      <table>
        <thead><tr><th>Run</th>{showStack && <th>Stack</th>}<th>Operation</th><th>Status</th><th>Risk</th><th>Approvals</th><th>Changes</th><th>Started by</th><th>Created</th></tr></thead>
        <tbody>{runs.map(r => (
          <tr key={r.id}>
            <td><Link to={`${base}runs/${r.id}`} className="mono">{r.id.slice(0, 8)}</Link></td>
            {showStack && <td>{r.stack} <span className="tag">{r.bu}</span></td>}
            <td>{r.operation}</td>
            <td><Status s={r.status} /></td>
            <td><RiskBadge level={r.risk?.level} /></td>
            <td className="small">{r.required_approvals.length ? `${r.approvals.length}/${r.required_approvals.length}` : "—"}</td>
            <td className="mono small">{r.plan_summary ? <><span className="add">+{r.plan_summary.add}</span> <span className="chg">~{r.plan_summary.change}</span> <span className="del">-{r.plan_summary.destroy + r.plan_summary.replace}</span></> : "—"}</td>
            <td>{r.created_by}</td>
            <td><Time iso={r.created_at} /></td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
