import type { Ctx } from "../App";
import { writableEntities } from "../api";
import { Empty, ErrorBox, Link, Loading, Status, Time, useLoad } from "../ui";

export default function Stacks({ ctx }: { ctx: Ctx }) {
  const { data, error } = useLoad(ctx.api.stacks, [ctx.t.slug], 5000);
  const rows = (data ?? []).filter(s => !ctx.entity || s.entity === ctx.entity);
  const base = `t/${ctx.t.slug}/`;
  return (
    <>
      <div className="head">
        <div><h1>Stacks</h1><div className="muted">{ctx.t.name} · each stack is one state file built only from approved public modules.</div></div>
        {writableEntities(ctx.t).length > 0 && <Link to={base + "stacks/new"}><button>New stack</button></Link>}
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : rows.length === 0 ? <Empty>No stacks here yet.</Empty> : (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Stack</th><th>Business unit</th><th>Environment</th><th>Modules</th><th>Last run</th><th>Updated</th></tr></thead>
            <tbody>{rows.map(s => (
              <tr key={s.id}>
                <td><Link to={`${base}stacks/${s.id}`}><strong>{s.name}</strong></Link></td>
                <td><span className="tag">{s.entity}</span></td>
                <td>{s.environment}</td>
                <td>{s.spec.modules.map(m => <span key={m.name} className="tag">{m.module}</span>)}</td>
                <td>{s.last_run ? <Link to={`${base}runs/${s.last_run.id}`}><Status s={s.last_run.status} /></Link> : <span className="muted">never</span>}</td>
                <td><Time iso={s.updated_at} /></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
