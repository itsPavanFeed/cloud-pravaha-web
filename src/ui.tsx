import { useCallback, useEffect, useState, type ReactNode, lazy, type ComponentType } from "react";
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
  applying: "busy", policy_failed: "bad", failed: "bad", discarded: "idle", no_drift: "ok", drifted: "wait",
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

// Page controls for server-side pagination: "1–10 of 37" with previous/next.
export function Pager({ offset, limit, total, onPage }: { offset: number; limit: number; total: number; onPage: (offset: number) => void }) {
  if (total <= limit) return null;
  const pages = Math.ceil(total / limit), page = Math.floor(offset / limit) + 1;
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <button className="ghost small" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>Previous</button>
      <span className="small muted">{offset + 1}–{Math.min(offset + limit, total)} of {total} · page {page} of {pages}</span>
      <button className="ghost small" disabled={offset + limit >= total} onClick={() => onPage(offset + limit)}>Next</button>
    </div>
  );
}

// lazyPage loads a page's code on demand. After a new release, the browser may
// still ask for an old chunk: reload once to pick up the new build instead of
// leaving a blank page.
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return lazy(() => load().then(m => { sessionStorage.removeItem("pravaha.reloaded"); return m; }, err => {
    if (!sessionStorage.getItem("pravaha.reloaded")) {
      sessionStorage.setItem("pravaha.reloaded", "1");
      window.location.reload();
    }
    throw err;
  }));
}
