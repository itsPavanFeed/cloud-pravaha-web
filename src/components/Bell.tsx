import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "../api";
import type { Ctx } from "../App";
import { ErrorBox, Time, go } from "../ui";

const dot: Record<string, string> = { action: "wait", success: "ok", error: "bad", warning: "wait", info: "idle" };

// The notification centre: a bell with the unread count (a small request every
// 30 seconds); the list loads only when opened, older items page by cursor.
export default function Bell({ ctx }: { ctx: Ctx }) {
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState(0);
  const [readUpto, setReadUpto] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [next, setNext] = useState<number | undefined>();
  const [error, setError] = useState<unknown>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    const poll = () => ctx.api.unread().then(u => { if (!stop) { setUnread(u.unread); setLatest(u.latest_id); setReadUpto(u.read_upto); } }, () => {});
    poll();
    const t = setInterval(poll, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [ctx.t.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setError(null);
    ctx.api.notifications(0).then(r => { setItems(r.items); setNext(r.next_before); }, setError);
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, ctx.t.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAll = async () => {
    try { await ctx.api.markRead(latest); setUnread(0); setReadUpto(latest); } catch (e) { setError(e); }
  };
  const older = async () => {
    if (!next) return;
    try { const r = await ctx.api.notifications(next); setItems([...items, ...r.items]); setNext(r.next_before); } catch (e) { setError(e); }
  };

  return (
    <div className="bell" ref={box}>
      <button className="bell-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={e => {
        // The panel is fixed to the viewport, anchored under the bell, so the
        // scrolling sidebar it sits in cannot clip it.
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 400)) });
        setOpen(!open);
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications" style={pos ?? undefined}>
          <div className="bell-head">
            <strong>Notifications</strong>
            <button className="ghost small" disabled={!unread} onClick={markAll}>Mark all read</button>
          </div>
          <ErrorBox error={error} />
          {items.length === 0 ? <p className="muted small" style={{ padding: "8px 12px" }}>Nothing yet.</p> : (
            <ul>{items.map(n => (
              <li key={n.id} className={n.id > readUpto ? "unread" : ""}>
                <button onClick={() => { setOpen(false); if (n.link) go(`t/${ctx.t.slug}/${n.link}`); }}>
                  <span className={`badge ${dot[n.severity]}`}>{n.severity === "action" ? "action needed" : n.severity}</span>
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="small muted bell-body">{n.body}</span>}
                  <span className="small muted">{n.bu ? `${n.entity}/${n.bu} · ` : ""}<Time iso={n.created_at} /></span>
                </button>
              </li>
            ))}</ul>
          )}
          {next && <div className="bell-foot"><button className="ghost small" onClick={older}>Older</button></div>}
        </div>
      )}
    </div>
  );
}
