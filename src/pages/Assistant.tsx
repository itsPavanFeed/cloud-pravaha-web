import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Ctx } from "../App";
import type { AssistantAnswer, AssistantTurn } from "../api";
import { Empty, ErrorBox, Loading, go, useLoad } from "../ui";
import { DRAFT_KEY } from "./StackNew";

type Entry = { q: string; a?: AssistantAnswer; error?: unknown };

const examples = [
  "Which module should I use for a private Kubernetes cluster on AWS, and what does the platform enforce?",
  "Draft a stack with an encrypted Postgres database for payments in production.",
  "Why would a run in a prod environment need finops and security approval?",
  "How do I bring an existing S3 bucket under management?",
];

export default function Assistant({ ctx }: { ctx: Ctx }) {
  const info = useLoad(ctx.api.assistantInfo, [ctx.t.slug]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [entries, status]);
  useEffect(() => () => abort.current?.abort(), []);

  if (!info.data) return info.error ? <ErrorBox error={info.error} /> : <Loading />;
  if (!info.data.enabled) return (
    <>
      <div className="head"><div><h1>Assistant</h1></div></div>
      <Empty>The assistant is not enabled on this tenant plane. An operator can enable it by setting <code>PRAVAHA_ASSISTANT_API_KEY</code> (it sends questions and the passages retrieved for them to the Anthropic API).</Empty>
    </>
  );

  const ask = async (question: string) => {
    question = question.trim();
    if (!question || busy) return;
    const history: AssistantTurn[] = entries.filter(e => e.a).flatMap(e => [
      { role: "user" as const, text: e.q }, { role: "assistant" as const, text: e.a!.text },
    ]);
    setEntries(es => [...es, { q: question }]);
    setQ(""); setBusy(true); setStatus("Starting");
    abort.current = new AbortController();
    try {
      const a = await ctx.api.ask(question, history, setStatus, abort.current.signal);
      setEntries(es => es.map((e, i) => (i === es.length - 1 ? { ...e, a } : e)));
    } catch (error) {
      setEntries(es => es.map((e, i) => (i === es.length - 1 ? { ...e, error } : e)));
    } finally {
      setBusy(false); setStatus("");
    }
  };

  const openDraft = (a: AssistantAnswer) => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ tenant: ctx.t.slug, ...a.draft })); } catch { /* storage unavailable */ }
    go(`t/${ctx.t.slug}/stacks/new`);
  };

  return (
    <>
      <div className="head">
        <div><h1>Assistant</h1><div className="muted">Answers come from the module catalog, the platform guide, this tenant’s policies and the stacks and environments you can see. It can draft stacks, but never creates, plans or applies anything.</div></div>
        {entries.length > 0 && !busy && <button className="ghost" onClick={() => setEntries([])}>New conversation</button>}
      </div>

      {entries.length === 0 && (
        <div className="panel">
          <div className="muted small" style={{ marginBottom: 8 }}>Try asking</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {examples.map(x => <button key={x} className="ghost small" onClick={() => ask(x)}>{x}</button>)}
          </div>
        </div>
      )}

      {entries.map((e, i) => (
        <Fragment key={i}>
          <div className="chat-q">{e.q}</div>
          <div className="panel chat-a" aria-live={i === entries.length - 1 ? "polite" : undefined}>
            {e.error ? <ErrorBox error={e.error} />
              : !e.a ? <p className="muted">{status || "Working"}…</p>
              : <>
                  <Markdown text={e.a.text} />
                  {e.a.draft && (
                    <div className="draft">
                      <div><strong>Draft stack</strong> <span className="tag">{e.a.draft.name}</span> in <span className="tag">{e.a.draft.environment}</span>
                        <span className="muted small"> — validated against the catalog; review it before creating.</span></div>
                      <details><summary className="small">Spec</summary><pre className="code">{JSON.stringify(e.a.draft.spec, null, 2)}</pre></details>
                      <button onClick={() => openDraft(e.a!)}>Open in the stack editor</button>
                    </div>
                  )}
                  {e.a.sources.length > 0 && (
                    <div className="sources small"><span className="muted">Sources </span>{e.a.sources.map(s => <span key={s.id} className="tag" title={s.title}>{s.id}</span>)}</div>
                  )}
                </>}
          </div>
        </Fragment>
      ))}
      <div ref={end} />

      <form className="panel chat-box" onSubmit={ev => { ev.preventDefault(); ask(q); }}>
        <label htmlFor="aq" className="sr-only">Question</label>
        <textarea id="aq" rows={3} maxLength={4000} value={q} placeholder="Ask about modules, policies, approvals or your stacks…"
          onChange={ev => setQ(ev.target.value)}
          onKeyDown={ev => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ask(q); } }} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted small">{info.data.model} · Enter to send, Shift+Enter for a new line</span>
          {busy ? <button type="button" className="ghost" onClick={() => abort.current?.abort()}>Stop</button>
            : <button type="submit" disabled={!q.trim()}>Ask</button>}
        </div>
      </form>
    </>
  );
}

// A small Markdown renderer that builds React elements (no HTML injection):
// headings, paragraphs, lists, fenced code, inline code, bold and citations.
function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(<pre className="code" key={out.length}>{code.join("\n")}</pre>);
    } else if (/^#{1,4} /.test(line)) {
      out.push(<h3 key={out.length}>{inline(line.replace(/^#+ /, ""))}</h3>);
      i++;
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ""));
      const li = items.map((t, k) => <li key={k}>{inline(t)}</li>);
      out.push(ordered ? <ol key={out.length}>{li}</ol> : <ul key={out.length}>{li}</ul>);
    } else if (line.trim() === "") {
      i++;
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() !== "" && !/^(```|#{1,4} |\s*([-*]|\d+\.) )/.test(lines[i]); i++) para.push(lines[i]);
      out.push(<p key={out.length}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="md">{out}</div>;
}

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[a-z]+:[^\]\s]+\])/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("`")) parts.push(<code key={parts.length}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) parts.push(<strong key={parts.length}>{t.slice(2, -2)}</strong>);
    else parts.push(<span key={parts.length} className="cite">{t.slice(1, -1)}</span>);
    last = m.index + t.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
