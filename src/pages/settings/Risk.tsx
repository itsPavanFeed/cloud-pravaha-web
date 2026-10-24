import { useState } from "react";
import type { RiskSettings, Step } from "../../api";
import { ErrorBox, Loading, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const steps: Step[] = ["manager", "finops", "security"];

export default function Risk({ ctx }: SectionProps) {
  const riskCfg = useLoad(ctx.api.riskSettings, [ctx.t.slug]);
  const [rs, setRs] = useState<RiskSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const cfg = rs ?? riskCfg.data;
  if (!cfg) return riskCfg.error ? <ErrorBox error={riskCfg.error} /> : <Loading />;
  const save = async () => { setError(null); try { await ctx.api.putRiskSettings(cfg); setRs(null); riskCfg.reload(); } catch (e) { setError(e); } };
  return (
    <div className="panel">
      <h2>Risk policy</h2>
      <p className="muted small">How plans are classified and which approvals each level needs. High risk always needs Security, and a higher level never needs fewer approvals.</p>
      <ErrorBox error={error} />
      <div className="grid">
        <div><label>Large change (resources)</label><input type="number" min={1} value={cfg.large_change} onChange={e => setRs({ ...cfg, large_change: Number(e.target.value) })} /></div>
        <div><label>Production is at least</label><select value={cfg.prod_level} onChange={e => setRs({ ...cfg, prod_level: e.target.value as "medium" | "high" })}><option value="medium">medium</option><option value="high">high</option></select></div>
        <div><label>Cost → medium ($/month, 0 = off)</label><input type="number" min={0} value={cfg.cost_medium_usd} onChange={e => setRs({ ...cfg, cost_medium_usd: Number(e.target.value) })} /></div>
        <div><label>Cost → high ($/month, 0 = off)</label><input type="number" min={0} value={cfg.cost_high_usd} onChange={e => setRs({ ...cfg, cost_high_usd: Number(e.target.value) })} /></div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Risk</th>{steps.map(st => <th key={st}>{st}</th>)}</tr></thead>
        <tbody>{(["low", "medium", "high"] as const).map(level => (
          <tr key={level}><td><strong>{level}</strong></td>{steps.map(st => (
            <td key={st}><input type="checkbox" aria-label={`${level}: ${st}`} checked={cfg.approvals[level].includes(st)} onChange={e => {
              const chosen = e.target.checked ? [...cfg.approvals[level], st] : cfg.approvals[level].filter(x => x !== st);
              setRs({ ...cfg, approvals: { ...cfg.approvals, [level]: steps.filter(x => chosen.includes(x)) } });
            }} /></td>))}</tr>))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={!rs} onClick={save}>Save risk policy</button>
        {rs && <button className="ghost" onClick={() => setRs(null)}>Discard changes</button>}
      </div>
    </div>
  );
}
