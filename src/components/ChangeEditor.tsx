import { useEffect, useState } from "react";
import type { Ctx } from "../App";
import type { Release } from "../api";
import { ErrorBox, Loading, go } from "../ui";

export type EditFile = { path: string; label: string; template?: string; optional?: boolean };

// ChangeEditor edits files of the modules or policies repository. Saving builds
// the change on top of the branch right away; only a change that builds is
// committed (a pull request on GitHub). DevOps then approves activating the
// release, which merges the pull request.
export default function ChangeEditor({ ctx, kind, files, title: initialTitle, intro, onClose }: {
  ctx: Ctx; kind: "modules" | "policies"; files: EditFile[]; title: string; intro: string; onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Record<string, { content: string; exists: boolean }> | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<unknown>(null);
  const [rel, setRel] = useState<Release | null>(null);
  const key = files.map(f => f.path).join("|");

  useEffect(() => {
    let stop = false;
    Promise.all(files.map(f => ctx.api.releaseFile(kind, f.path))).then(rs => {
      if (stop) return;
      const l: Record<string, { content: string; exists: boolean }> = {};
      const t: Record<string, string> = {};
      rs.forEach((r, i) => {
        const f = files[i];
        l[f.path] = { content: r.content ?? "", exists: r.exists };
        t[f.path] = r.exists ? r.content ?? "" : f.template ?? "";
      });
      setLoaded(l); setText(t);
    }, setError);
    return () => { stop = true; };
  }, [ctx.t.slug, kind, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the build until it is ready (pull request opened) or failed.
  useEffect(() => {
    if (!rel || rel.status !== "building") return;
    const t = setInterval(() => { ctx.api.release(kind, rel.id).then(setRel, () => {}); }, 2000);
    return () => clearInterval(t);
  }, [rel?.id, rel?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return error ? <ErrorBox error={error} /> : <Loading />;
  const changed = files.filter(f => text[f.path] !== (loaded[f.path].exists ? loaded[f.path].content : f.template ?? "") || (!loaded[f.path].exists && !f.optional && text[f.path].trim() !== ""));
  const submit = async () => {
    setError(null);
    const body: Record<string, string | null> = {};
    for (const f of files) {
      const t = text[f.path];
      if (!loaded[f.path].exists && t.trim() === "") continue; // an optional new file left empty
      if (loaded[f.path].exists && t === loaded[f.path].content) continue;
      body[f.path] = t.trim() === "" ? null : t;
    }
    try { setRel(await ctx.api.proposeReleaseChange(kind, { title, files: body })); } catch (e) { setError(e); }
  };

  if (rel) {
    const failed = rel.checks.filter(c => !c.ok);
    return (
      <div className="panel">
        <h3>Change for {kind} release {rel.number}</h3>
        {rel.status === "building" && <p><span className="badge busy">building</span> Validating and building your change on top of the branch…</p>}
        {rel.status === "failed" && <>
          <div className="error">The change did not build, so nothing was committed. {rel.error}</div>
          <ul className="checks">{failed.map(c => <li key={c.name}><strong>{c.name}</strong>{c.errors && <ul className="small">{c.errors.map((e, i) => <li key={i} className="mono">{e}</li>)}</ul>}</li>)}</ul>
          <button onClick={() => setRel(null)}>Back to the editor</button>
        </>}
        {rel.status !== "building" && rel.status !== "failed" && <>
          <div className="notice">Every check passed. {rel.pr_number
            ? <>The change is committed in pull request <a href={rel.pr_url} target="_blank" rel="noopener noreferrer">#{rel.pr_number}</a>.</>
            : <>The change is committed to the repository.</>} Next: request activation; DevOps approves it{rel.pr_number ? ", and the pull request merges" : ""}.</div>
          <div className="row">
            <button onClick={() => go(`t/${ctx.t.slug}/settings/releases/${kind}/${rel.id}`)}>Open release {rel.number}</button>
            <button className="ghost" onClick={onClose}>Close</button>
          </div>
        </>}
      </div>
    );
  }

  return (
    <div className="panel">
      <ErrorBox error={error} />
      <div className="drill-head">
        <div><h3 style={{ margin: 0 }}>{initialTitle}</h3><div className="muted small">{intro}</div></div>
        <button className="ghost" onClick={onClose}>Cancel</button>
      </div>
      {files.map(f => (
        <div key={f.path} style={{ marginBottom: 12 }}>
          <label>{f.label} <span className="mono muted small">{f.path}{loaded[f.path].exists ? "" : " (new file)"}</span></label>
          <textarea className="mono" style={{ minHeight: 260 }} spellCheck={false} value={text[f.path]} onChange={e => setText({ ...text, [f.path]: e.target.value })} />
        </div>
      ))}
      <label>Summary of the change</label>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <div className="row" style={{ marginTop: 10 }}>
        <button disabled={changed.length === 0} onClick={submit}>Build and propose</button>
        <span className="small muted">{changed.length === 0 ? "No changes yet." : "Builds now; commits as a pull request only if every check passes."}</span>
      </div>
    </div>
  );
}
