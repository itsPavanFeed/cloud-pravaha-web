import { useState } from "react";
import type { Ctx } from "../App";
import { canApprove, central, has, type Release, type Run, type Step } from "../api";
import { ErrorBox, Link, Loading, Time, go, useLoad } from "../ui";

type Approvers = Awaited<ReturnType<typeof central.approvers>>;

const stepTitle: Record<string, string> = { manager: "Manager", finops: "FinOps", security: "Security" };

// Everything waiting for someone's approval: plans that need manager, FinOps
// or Security signatures, and module or policy releases waiting for DevOps.
// DevOps can override any of them, with a reason that is recorded.
export default function Approvals({ ctx }: { ctx: Ctx }) {
  const runs = useLoad(ctx.api.runs, [ctx.t.slug], 10000);
  const mods = useLoad(() => ctx.api.releases("modules"), [ctx.t.slug], 10000);
  const pols = useLoad(() => ctx.api.releases("policies"), [ctx.t.slug], 10000);
  const people = useLoad(() => central.approvers(ctx.t.slug).catch(() => null), [ctx.t.slug]);
  const [error, setError] = useState<unknown>(null);
  const reload = () => { runs.reload(); mods.reload(); pols.reload(); };
  if (!runs.data) return runs.error ? <ErrorBox error={runs.error} /> : <Loading />;
  const waitingRuns = runs.data.filter(r => r.status === "planned" && r.policy_result?.passed && r.required_approvals.some(s => !r.approvals.some(a => a.step === s)));
  const waitingRels = [...(mods.data?.releases ?? []), ...(pols.data?.releases ?? [])].filter(r => r.status === "pending");
  const devops = has(ctx.t, "devops");

  return (
    <>
      <div className="head">
        <div><h1>Approvals</h1>
          <div className="muted">Plans and releases waiting for a decision. Each shows who raised it and who can approve it.{devops && " As DevOps you can override, with a reason that is recorded in the audit log."}</div></div>
        {waitingRuns.length + waitingRels.length > 0 && <span className="badge wait">{waitingRuns.length + waitingRels.length} waiting</span>}
      </div>
      <ErrorBox error={error} />

      {waitingRuns.length === 0 && waitingRels.length === 0 && (
        <div className="panel empty-card">
          <div className="empty-icon" aria-hidden="true">✓</div>
          <h3>Nothing is waiting for approval</h3>
          <p className="muted small" style={{ maxWidth: 460 }}>Plans that need a manager, FinOps or Security signature, and module or policy releases waiting for DevOps, appear here as soon as they are raised.</p>
        </div>
      )}

      {waitingRuns.length > 0 && <>
        <h2>Plans waiting for approval <span className="muted small">{waitingRuns.length}</span></h2>
        {waitingRuns.map(r => <RunCard key={r.id} ctx={ctx} run={r} people={people.data ?? null} devops={devops} onDone={reload} onError={setError} />)}
      </>}

      {waitingRels.length > 0 && <>
        <h2 style={{ marginTop: waitingRuns.length ? 28 : 0 }}>Releases waiting for DevOps <span className="muted small">{waitingRels.length}</span></h2>
        {waitingRels.map(r => <ReleaseCard key={r.id} ctx={ctx} rel={r} people={people.data ?? null} devops={devops} onDone={reload} onError={setError} />)}
      </>}
    </>
  );
}

function eligible(step: string, run: Run, people: Approvers | null): string[] | null {
  if (!people) return null;
  const list = step === "manager" ? [...(people.bu_managers[run.bu] ?? []), ...(people.entity_managers[run.entity] ?? [])] : people.tenant[step] ?? [];
  return [...new Set(list)].filter(e => e !== run.created_by && !run.approvals.some(a => a.approver === e));
}

function Override({ onOverride }: { onOverride: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button className="ghost small danger-text" onClick={() => setOpen(true)}>Override</button>;
  return (
    <div className="row override">
      <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why override the approvals? (recorded)" />
      <button className="danger small" disabled={!reason.trim()} onClick={() => onOverride(reason)}>Override and continue</button>
      <button className="ghost small" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function RunCard({ ctx, run, people, devops, onDone, onError }: { ctx: Ctx; run: Run; people: Approvers | null; devops: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const mine = run.required_approvals.filter(s => !run.approvals.some(a => a.step === s) && canApprove(ctx.t, s as Step, run.bu) && run.created_by !== ctx.me.user.email);
  return (
    <div className="panel approval">
      <div className="approval-head">
        <div>
          <Link to={`t/${ctx.t.slug}/runs/${run.id}`}><strong>{run.stack}</strong></Link> <span className="muted">· {run.operation} in {run.entity}/{run.environment} · {run.bu}</span>
          {run.risk && <span className={`badge ${run.risk.level === "high" ? "bad" : run.risk.level === "medium" ? "wait" : "idle"}`} style={{ marginLeft: 8 }}>{run.risk.level} risk</span>}
          {run.plan_summary && <span className="small muted"> · +{run.plan_summary.add} ~{run.plan_summary.change} −{run.plan_summary.destroy}</span>}
        </div>
        <div className="small muted">Raised by <strong className="who">{run.created_by}</strong>{run.planned_at && <> · <Time iso={run.planned_at} /></>}</div>
      </div>
      <div className="steps">
        {run.required_approvals.map(step => {
          const done = run.approvals.find(a => a.step === step);
          const who = eligible(step, run, people);
          return (
            <div key={step} className={`step-card ${done ? "done" : ""}`}>
              <span className="small"><strong>{stepTitle[step] ?? step}</strong></span>
              {done ? <span className="small">{done.approver.startsWith("override:") ? <span className="del">overridden by {done.approver.split(":")[1]}</span> : <>signed by <strong className="who">{done.approver}</strong></>}</span>
                : <span className="small muted">waiting for {who === null ? (step === "manager" ? `a manager of ${run.bu}` : `someone with ${step}`) : who.length ? who.join(", ") : <span className="del">nobody eligible</span>}</span>}
            </div>
          );
        })}
      </div>
      <div className="row">
        {mine.length > 0 && <button className="small" onClick={() => go(`t/${ctx.t.slug}/runs/${run.id}`)}>Review and sign {mine.map(s => stepTitle[s] ?? s).join(", ")}</button>}
        {mine.length === 0 && <button className="ghost small" onClick={() => go(`t/${ctx.t.slug}/runs/${run.id}`)}>Open plan</button>}
        {devops && <Override onOverride={async reason => { try { await ctx.api.overrideRun(run.id, reason); onDone(); } catch (e) { onError(e); } }} />}
      </div>
    </div>
  );
}

function ReleaseCard({ ctx, rel, people, devops, onDone, onError }: { ctx: Ctx; rel: Release; people: Approvers | null; devops: boolean; onDone: () => void; onError: (e: unknown) => void }) {
  const me = ctx.me.user.email;
  const approved = rel.approvals.filter(a => a.decision === "approve");
  const who = people ? (people.tenant.devops ?? []).filter(e => e !== rel.requested_by && !(rel.origin === "console" && rel.created_by.endsWith(e)) && !approved.some(a => a.approver === e)) : null;
  const author = rel.origin === "console" && rel.created_by === me;
  const canDecide = devops && rel.requested_by !== me && !author && !rel.approvals.some(a => a.approver === me);
  const [reason, setReason] = useState("");
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); onDone(); } catch (e) { onError(e); } };
  return (
    <div className="panel approval">
      <div className="approval-head">
        <div>
          <Link to={`t/${ctx.t.slug}/settings/releases/${rel.kind}/${rel.id}`}><strong>{rel.kind === "modules" ? "Module" : "Policy"} release {rel.number}</strong></Link>
          <span className="muted"> · {rel.title || rel.revision.slice(0, 7)}</span>
          {rel.pr_number && <> · {rel.pr_url ? <a href={rel.pr_url} target="_blank" rel="noopener noreferrer">PR #{rel.pr_number}</a> : `PR #${rel.pr_number}`} <span className="small muted">(merges on activation)</span></>}
        </div>
        <div className="small muted">Raised by <strong className="who">{rel.requested_by}</strong>{rel.requested_at && <> · <Time iso={rel.requested_at} /></>}
          {rel.origin === "console" && <> · change by {rel.created_by.replace(/^user:/, "")}</>}</div>
      </div>
      <div className="steps">
        <div className={`step-card ${approved.length ? "done" : ""}`}>
          <span className="small"><strong>DevOps</strong></span>
          <span className="small">{approved.length > 0 && <>approved by <strong className="who">{approved.map(a => a.approver).join(", ")}</strong>; </>}
            <span className="muted">{who === null ? "waiting for DevOps" : who.length ? `can approve: ${who.join(", ")}` : approved.length ? "" : <span className="del">nobody else holds devops</span>}</span></span>
        </div>
      </div>
      <div className="row">
        {canDecide && <>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" style={{ maxWidth: 260 }} />
          <button className="small" onClick={() => act(() => ctx.api.approveRelease(rel.kind, rel.id, reason))}>Approve</button>
          <button className="ghost small" onClick={() => act(() => ctx.api.rejectRelease(rel.kind, rel.id, reason))}>Reject</button>
        </>}
        {devops && !canDecide && <span className="small muted">{author ? "You made this change, so you cannot approve it." : rel.requested_by === me ? "You requested it, so you cannot approve it." : ""}</span>}
        {devops && <Override onOverride={reason => act(() => ctx.api.overrideRelease(rel.kind, rel.id, reason))} />}
      </div>
    </div>
  );
}
