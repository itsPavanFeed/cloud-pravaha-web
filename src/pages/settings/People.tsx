import { useState } from "react";
import { central } from "../../api";
import { Empty, ErrorBox, Loading, Pager, Time, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const tenantRoles = ["tenant_admin", "finops", "security", "auditor"];
const scopedRoles = ["admin", "manager", "developer", "viewer"];
const PAGE = 15;

export default function People({ ctx, showSecret }: SectionProps) {
  const slug = ctx.t.slug;
  const members = useLoad(() => central.members(slug), [slug]);
  const entities = useLoad(() => central.entities(slug), [slug]);
  const bus = useLoad(() => central.bus(slug), [slug]);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [granting, setGranting] = useState(false);
  const [m, setM] = useState({ email: "", scope: "", role: "finops" }); // scope: "" | entity:x | bu:y
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const roles = m.scope ? scopedRoles : tenantRoles;

  if (!members.data) return members.error ? <ErrorBox error={members.error} /> : <Loading />;
  const rows = members.data.filter(x => !q || `${x.email} ${x.role} ${x.entity ?? ""} ${x.bu ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const page = rows.slice(offset, offset + PAGE);
  const grant = () => {
    const [kind, value] = m.scope.split(":");
    return central.addMember(slug, { email: m.email, role: m.role, ...(kind === "entity" ? { entity: value } : kind === "bu" ? { bu: value } : {}) });
  };

  return (
    <div className="panel">
      <div className="drill-head">
        <h2>People and roles</h2>
        <div className="row">
          <input type="search" placeholder="Search people, roles, scopes" value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} style={{ maxWidth: 260 }} />
          <button onClick={() => setGranting(!granting)}>{granting ? "Close" : "+ Grant role"}</button>
        </div>
      </div>
      <p className="muted small">Tenant-wide: tenant_admin, finops and security (approval steps everywhere), auditor (reads everything). On a product or business unit: admin, manager (signs the manager step), developer, viewer. Product roles apply to all of its business units.</p>
      <ErrorBox error={error} />
      {granting && (
        <div className="inline-form">
          <div className="grid">
            <div><label>Email</label><input autoFocus value={m.email} onChange={e => setM({ ...m, email: e.target.value })} placeholder="alice@example.com" /></div>
            <div><label>Scope</label><select value={m.scope} onChange={e => setM({ ...m, scope: e.target.value, role: e.target.value ? "developer" : "finops" })}>
              <option value="">Whole tenant</option>
              {(entities.data ?? []).map(e => (
                <optgroup key={e.slug} label={e.name}>
                  <option value={`entity:${e.slug}`}>{e.name} (all its business units)</option>
                  {(bus.data ?? []).filter(b => b.entity === e.slug).map(b => <option key={b.slug} value={`bu:${b.slug}`}>{b.name}</option>)}
                </optgroup>))}
            </select></div>
            <div><label>Role</label><select value={m.role} onChange={e => setM({ ...m, role: e.target.value })}>{roles.map(x => <option key={x}>{x}</option>)}</select></div>
          </div>
          <div className="row"><button className="small" disabled={!m.email} onClick={() => run(async () => { await grant(); setM({ ...m, email: "" }); setGranting(false); members.reload(); })}>Grant</button></div>
        </div>
      )}
      {rows.length === 0 ? <Empty>No one matches.</Empty> : (
        <>
          <table>
            <thead><tr><th>Person</th><th>Scope</th><th>Role</th><th>Granted</th><th /></tr></thead>
            <tbody>{page.map(x => (
              <tr key={x.id}>
                <td>{x.email}</td>
                <td>{x.bu ? <><span className="muted small">business unit</span> <span className="tag">{x.bu}</span></> : x.entity ? <><span className="muted small">product</span> <span className="tag">{x.entity}</span></> : <span className="muted">tenant</span>}</td>
                <td>{x.role}</td>
                <td className="small muted">{x.created_by} · <Time iso={x.created_at} /></td>
                <td className="row">
                  <button className="ghost small" onClick={() => run(async () => { const t = await central.memberToken(slug, x.email, "issued by admin", 30); showSecret({ label: `Token for ${t.user}`, value: t.secret }); })}>Issue token</button>
                  <button className="danger small" onClick={() => run(async () => { await central.removeMember(slug, x.id); members.reload(); })}>Remove</button>
                </td>
              </tr>))}
            </tbody>
          </table>
          <Pager offset={offset} limit={PAGE} total={rows.length} onPage={setOffset} />
        </>
      )}
    </div>
  );
}
