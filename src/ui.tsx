import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "./api";

// ---- hash routing (no router dependency) ----
export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, "") || "stacks").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}
export const go = (path: string) => { window.location.hash = "/" + path; };
export const Link = ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
  <a href={"#/" + to} className={className}>{children}</a>;

// ---- data loading ----
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => fn().then(d => { setData(d); setError(null); }, setError), deps);
  useEffect(() => {
    load();
    if (!pollMs) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { data, error, reload: load };
}

// ---- small components ----
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="error" role="alert">
      <strong>{e ? e.message : String(error)}</strong>
      {e && e.details.length > 0 && <ul>{e.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
    </div>
  );
}

export const Loading = () => <p className="muted">Loading…</p>;

const tone: Record<string, string> = {
  applied: "ok", no_changes: "ok", planned: "wait", apply_queued: "wait", queued: "idle", planning: "busy",
  applying: "busy", policy_failed: "bad", failed: "bad", discarded: "idle",
};
export const statusLabel = (s: string) => s.replace(/_/g, " ");
export const Status = ({ s }: { s: string }) => <span className={`badge ${tone[s] ?? "idle"}`}>{statusLabel(s)}</span>;

export const ago = (iso?: string) => {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};
export const Time = ({ iso }: { iso?: string }) => <time dateTime={iso} title={iso ? new Date(iso).toLocaleString() : ""}>{ago(iso)}</time>;

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="ghost small" type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

// Risk badge for a run's classification.
const riskTone: Record<string, string> = { low: "ok", medium: "wait", high: "bad" };
export const RiskBadge = ({ level }: { level?: string }) =>
  level ? <span className={`badge ${riskTone[level] ?? "idle"}`}>{level} risk</span> : <span className="muted">—</span>;
