import { useState } from "react";
import type { Ctx } from "../App";
import { has } from "../api";
import { ErrorBox, Loading, Time, useLoad } from "../ui";

export default function Audit({ ctx }: { ctx: Ctx }) {
  const api = ctx.api;
  const tenantWide = has(ctx.t, "tenant_admin", "finops", "security", "auditor");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error } = useLoad(() => api.audit(query), [ctx.t.slug, query], 10000);
  const [verify, setVerify] = useState<Awaited<ReturnType<typeof api.verifyAudit>> | null>(null);
  const [verr, setVerr] = useState<unknown>(null);
  return (
    <>
      <div className="head">
        <div><h1>Audit log</h1><div className="muted">{ctx.t.name}’s own audit log, append-only and hash-chained. {tenantWide ? "You see every business unit." : "You see your business units’ events."}</div></div>
        {tenantWide && <button className="ghost" onClick={() => { setVerr(null); api.verifyAudit().then(setVerify, setVerr); }}>Verify chain</button>}
      </div>
      {verify && (verify.intact ? <div className="success">Chain intact — {verify.checked} events verified.</div> : <div className="error">Chain broken at event {verify.first_broken_id}.</div>)}
      <ErrorBox error={verr || error} />
      <form className="row" style={{ marginBottom: 14 }} onSubmit={e => { e.preventDefault(); setQuery(q); }}>
        <input style={{ maxWidth: 360 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by action, actor or target (e.g. run.approve)" />
        <button className="ghost">Filter</button>
      </form>
      {!data ? <Loading /> : (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Unit</th><th>Details</th></tr></thead>
            <tbody>{data.filter(e => !ctx.entity || e.entity === ctx.entity).map(e => (
              <tr key={e.id}>
                <td className="muted">{e.id}</td><td><Time iso={e.ts} /></td><td>{e.actor}</td>
                <td><span className="tag">{e.action}</span></td><td className="mono small">{e.target}</td><td>{e.entity ? <span className="tag">{e.entity}</span> : <span className="muted small">tenant</span>}</td>
                <td><details><summary className="small muted">payload</summary><pre className="code small">{JSON.stringify(e.payload, null, 2)}</pre><div className="mono small muted">hash {e.hash.slice(0, 24)}…</div></details></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
