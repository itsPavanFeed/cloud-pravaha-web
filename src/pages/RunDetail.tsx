import { useEffect, useRef, useState } from "react";
import type { Ctx } from "../App";
import { canApprove, canChange, entityRoles, type LogChunk, type Step } from "../api";
import { ErrorBox, Link, Loading, RiskBadge, Status, Time, useLoad } from "../ui";

const active = ["queued", "planning", "apply_queued", "applying"];
const stepLabel: Record<Step, string> = { manager: "Manager", finops: "FinOps", security: "Security" };
const stepWho: Record<Step, string> = {
  manager: "a manager of the business unit", finops: "the tenant's FinOps role", security: "the tenant's Security role",
};

export default function RunDetail({ ctx, id }: { ctx: Ctx; id: string }) {
  const [poll, setPoll] = useState(2000);
  const { data: run, error, reload } = useLoad(() => ctx.api.run(id), [ctx.t.slug, id], poll);
  const [logs, setLogs] = useState<LogChunk[]>([]);
  const last = useRef(0);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (run) setPoll(active.includes(run.status) ? 2000 : 0); }, [run?.status]);
  useEffect(() => { last.current = 0; setLogs([]); }, [id]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const more = await ctx.api.logs(id, last.current);
        if (!stop && more.length) { last.current = more[more.length - 1].seq; setLogs(l => [...l, ...more]); }
      } catch { /* shown via the run's error */ }
    };
    tick();
    if (!poll) return () => { stop = true; };
    const t = setInterval(tick, poll);
    return () => { stop = true; clearInterval(t); };
  }, [id, poll]);

  if (!run) return error ? <ErrorBox error={error} /> : <Loading />;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await fn(); setReason(""); setPoll(2000); reload(); } catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const me = ctx.me.user.email;
  const s = run.plan_summary;
  const violations = run.policy_result?.violations ?? [];
  const signed = new Map(run.approvals.map(a => [a.step, a]));
  const mine = run.approvals.find(a => a.approver === me);
  const own = run.created_by === me;
  const signable = run.status === "planned" && !own && !mine
    ? run.required_approvals.filter(st => !signed.has(st) && canApprove(ctx.t, st, run.entity)) : [];
  const base = `t/${ctx.t.slug}/`;

  return (
    <>
      <div className="head">
        <div>
          <div className="muted small"><Link to={`${base}stacks/${run.stack_id}`}>{run.stack}</Link> · {run.environment} · <span className="tag">{run.entity}</span></div>
          <h1>{run.operation === "destroy" ? "Destroy" : "Apply"} run <span className="mono">{run.id.slice(0, 8)}</span></h1>
        </div>
        <div className="row"><RiskBadge level={run.risk?.level} /><Status s={run.status} /></div>
      </div>
      <ErrorBox error={error} />

      {run.risk && (
        <div className="panel">
          <h2>Approval chain</h2>
          <p className="muted small">Risk <strong>{run.risk.level}</strong>: {run.risk.reasons.join("; ")}. Each step needs a different person, and not the person who started the run.</p>
          <div className="chain">
            {run.required_approvals.map((st, i) => {
              const a = signed.get(st);
              return (
                <div key={st} className={`step ${a ? "done" : ""}`}>
                  <div className="step-n">{a ? "✓" : i + 1}</div>
                  <div>
                    <strong>{stepLabel[st]}</strong>
                    <div className="muted small">{a ? <>{a.approver} · <Time iso={a.created_at} />{a.reason && ` — ${a.reason}`}</> : `Needs ${stepWho[st]}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {run.status === "planned" && (
            <>
              {own && <p className="notice">You started this run, so you cannot approve it.</p>}
              {mine && !own && <p className="notice">You already signed the {stepLabel[mine.step]} step; another person must sign the rest.</p>}
              {signable.length > 0 && (
                <>
                  <label htmlFor="reason">Reason <span className="muted">(recorded in the audit log)</span></label>
                  <input id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. reviewed in CHG-1234" maxLength={500} />
                </>
              )}
              <ErrorBox error={actionError} />
              <div className="row" style={{ marginTop: 12 }}>
                {signable.map(st => (
                  <button key={st} disabled={busy} onClick={() => act(() => ctx.api.approve(run.id, st, reason))}>Approve as {stepLabel[st]}</button>
                ))}
                {(canChange(ctx.t, run.entity) || entityRoles(ctx.t, run.entity).includes("manager")) &&
                  <button className="ghost" disabled={busy} onClick={() => act(() => ctx.api.discard(run.id, reason || "discarded from UI"))}>Discard</button>}
              </div>
              {signable.length === 0 && !own && !mine && <p className="muted small">None of the remaining steps match your roles.</p>}
            </>
          )}
        </div>
      )}
      {run.status === "queued" && canChange(ctx.t, run.entity) && (
        <div className="row" style={{ marginBottom: 18 }}><button className="ghost" disabled={busy} onClick={() => act(() => ctx.api.discard(run.id, "cancelled before planning"))}>Cancel run</button></div>
      )}
      {run.error && <div className="error"><strong>{run.status === "discarded" ? "Discarded" : "Error"}:</strong> {run.error}</div>}

      <div className="grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Plan</h3>
          {s ? (
            <div className="counts">
              <div><b className="add">{s.add}</b>add</div><div><b className="chg">{s.change}</b>change</div>
              <div><b className="del">{s.destroy}</b>destroy</div><div><b className="del">{s.replace}</b>replace</div>
            </div>
          ) : <p className="muted">{active.includes(run.status) ? "Waiting for the runner…" : "No plan."}</p>}
        </div>
        <div className="card">
          <h3>Policy</h3>
          {!run.policy_result ? <p className="muted">Evaluated after planning.</p> :
            run.policy_result.passed ? <p><span className="badge ok">passed</span> {violations.length > 0 && <span className="muted">with {violations.length} advisory</span>}</p> :
              <p><span className="badge bad">blocked</span></p>}
          {violations.map((v, i) => (
            <div key={i} className="small" style={{ marginTop: 6 }}>
              <span className={`badge ${v.level === "hard" ? "bad" : "wait"}`}>{v.rule}</span> {v.message} {v.address && <span className="mono muted">{v.address}</span>}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Estimated cost</h3>
          {!run.cost ? <p className="muted">After planning.</p> : (
            <>
              <div className="counts"><div><b className={run.cost.monthly_delta_usd > 0 ? "chg" : "add"}>{run.cost.monthly_delta_usd >= 0 ? "+" : "−"}${Math.abs(run.cost.monthly_delta_usd).toFixed(2)}</b>per month</div></div>
              {run.cost.items.slice(0, 4).map(i => <div key={i.address} className="small mono muted">{i.address} {i.monthly_usd >= 0 ? "+" : "−"}${Math.abs(i.monthly_usd).toFixed(2)}</div>)}
              <p className="muted small">{run.cost.unpriced_resources > 0 && `${run.cost.unpriced_resources} usage-based resource(s) not priced. `}Approximate list prices.</p>
            </>
          )}
        </div>
        <div className="card">
          <h3>Who and when</h3>
          <dl className="kv">
            <dt>Started by</dt><dd>{run.created_by} · <Time iso={run.created_at} /></dd>
            <dt>Finished</dt><dd><Time iso={run.finished_at} /></dd>
            <dt>Plan</dt><dd className="mono small">{run.plan_sha256 ? run.plan_sha256.slice(0, 16) + "…" : "—"}</dd>
          </dl>
        </div>
      </div>

      {s && s.resources.length > 0 && (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Resource</th><th>Type</th><th>Action</th></tr></thead>
            <tbody>{s.resources.map(r => (
              <tr key={r.address}>
                <td className="mono small">{r.address}</td><td className="mono small">{r.type}</td>
                <td><span className={r.actions.length === 2 ? "del" : r.actions[0] === "create" ? "add" : r.actions[0] === "delete" ? "del" : "chg"}>{r.actions.join(" → ")}</span></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Log</h2>
      <pre className="log" aria-live="polite">{logs.map(l => l.chunk).join("") || "No output yet."}</pre>
    </>
  );
}
