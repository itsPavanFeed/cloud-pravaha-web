import { useState } from "react";
import { Empty, ErrorBox, Loading, Time, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

export default function Runners({ ctx, showSecret }: SectionProps) {
  const runners = useLoad(ctx.api.runners, [ctx.t.slug], 10000);
  const [adding, setAdding] = useState(false);
  const [r, setR] = useState({ name: "", pool: "default" });
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  if (!runners.data) return runners.error ? <ErrorBox error={runners.error} /> : <Loading />;
  const active = runners.data.filter(x => !x.revoked_at);
  return (
    <div className="panel">
      <div className="drill-head">
        <div><h2>Runners</h2><div className="muted small">Runners execute OpenTofu next to {ctx.t.name}’s clouds and poll this tenant’s backend outbound. Each serves one pool; environments pick a pool.</div></div>
        <button onClick={() => setAdding(!adding)}>{adding ? "Close" : "+ Register runner"}</button>
      </div>
      <ErrorBox error={error} />
      {adding && (
        <div className="inline-form row">
          <input autoFocus style={{ maxWidth: 220 }} placeholder="name, e.g. prod-aws-1" value={r.name} onChange={e => setR({ ...r, name: e.target.value })} />
          <input style={{ maxWidth: 160 }} placeholder="pool" value={r.pool} onChange={e => setR({ ...r, pool: e.target.value })} />
          <button className="small" disabled={!r.name} onClick={() => run(async () => { const x = await ctx.api.createRunner(r); showSecret({ label: `Runner token for ${x.runner.name} (PRAVAHA_RUNNER_TOKEN)`, value: x.secret }); setAdding(false); setR({ name: "", pool: r.pool }); runners.reload(); })}>Register</button>
        </div>
      )}
      {active.length === 0 ? <Empty>No active runners. Register one and start it with the token shown.</Empty> : (
        <table>
          <thead><tr><th>Runner</th><th>Pool</th><th>Last seen</th><th /></tr></thead>
          <tbody>{active.map(x => (
            <tr key={x.id}><td>{x.name}</td><td><span className="tag">{x.pool}</span></td><td><Time iso={x.last_seen_at} /></td>
              <td><button className="danger small" onClick={() => run(async () => { await ctx.api.revokeRunner(x.id); runners.reload(); })}>Revoke</button></td></tr>))}
          </tbody>
        </table>
      )}
      {runners.data.length > active.length && <p className="muted small">{runners.data.length - active.length} revoked runner(s) hidden.</p>}
    </div>
  );
}
