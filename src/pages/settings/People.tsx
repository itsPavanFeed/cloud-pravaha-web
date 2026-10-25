import { useState } from "react";
import { central, type Membership } from "../../api";
import { Empty, ErrorBox, Loading, Pager, useLoad } from "../../ui";
import type { SectionProps } from "./Settings";

const tenantRoles = ["tenant_admin", "finops", "security", "devops", "auditor"];
const scopedRoles = ["admin", "manager", "developer", "viewer"];
const roleHint: Record<string, string> = {
  tenant_admin: "full control", finops: "signs the FinOps step", security: "signs the Security step",
  devops: "full control; approves releases", auditor: "reads everything",
  admin: "manages the product or unit", manager: "signs the manager step", developer: "writes stacks, starts runs", viewer: "reads",
};
const PAGE = 15;

type Grant = { role: string; entity?: string; bu?: string };
type Person = { email: string; grants: Membership[] };

const scopeOf = (g: Grant) => (g.bu ? `bu:${g.bu}` : g.entity ? `entity:${g.entity}` : "");
const same = (a: Grant, b: Grant) => a.role === b.role && (a.entity ?? "") === (b.entity ?? "") && (a.bu ?? "") === (b.bu ?? "");

export default function People({ ctx, showSecret }: SectionProps) {
  const slug = ctx.t.slug;
  const members = useLoad(() => central.members(slug), [slug]);
  const entities = useLoad(() => central.entities(slug), [slug]);
  const bus = useLoad(() => central.bus(slug), [slug]);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<{ email: string; grants: Grant[]; isNew: boolean } | null>(null);
  const [removing, setRemoving] = useState("");
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };

  if (!members.data) return members.error ? <ErrorBox error={members.error} /> : <Loading />;
  const people: Person[] = [];
  for (const m of members.data) {
    const p = people.find(x => x.email === m.email);
    if (p) p.grants.push(m); else people.push({ email: m.email, grants: [m] });
  }
  const rows = people.filter(p => !q || `${p.email} ${p.grants.map(g => `${g.role} ${g.entity ?? ""} ${g.bu ?? ""}`).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const page = rows.slice(offset, offset + PAGE);
  const entityName = (slug: string) => entities.data?.find(e => e.slug === slug)?.name ?? slug;
  const buName = (slug: string) => bus.data?.find(b => b.slug === slug)?.name ?? slug;

  return (
    <div className="panel">
      <div className="drill-head">
        <h2>People and roles</h2>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="search" placeholder="Search people, roles, products" value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} style={{ maxWidth: 260 }} />
          <button onClick={() => setEditing({ email: "", grants: [{ role: "developer" }], isNew: true })}>+ Add person</button>
        </div>
      </div>
      <p className="muted small">tenant_admin and devops have full control: they manage the tenant, write stacks anywhere, sign any approval and can override. Other tenant-wide roles apply everywhere; product roles apply to all of the product's business units.</p>
      <ErrorBox error={error} />
      {editing && (
        <RoleEditor key={editing.email || "new"} initial={editing} entities={entities.data ?? []} bus={bus.data ?? []} self={ctx.me.user.email}
          onCancel={() => setEditing(null)}
          onSave={(email, grants) => run(async () => { await central.setUserRoles(slug, email, grants); setEditing(null); members.reload(); })} />
      )}
      {rows.length === 0 ? <Empty>No one matches.</Empty> : (
        <>
          <table>
            <thead><tr><th>Person</th><th>Roles</th><th /></tr></thead>
            <tbody>{page.map(p => (
              <tr key={p.email}>
                <td className="nowrap"><strong>{p.email}</strong>{p.email === ctx.me.user.email && <span className="muted small"> (you)</span>}</td>
                <td>{p.grants.map(g => (
                  <span key={g.id} className="role-chip" title={roleHint[g.role]}>
                    <strong>{g.role}</strong>
                    <span className="muted">{g.bu ? ` · ${buName(g.bu)}` : g.entity ? ` · ${entityName(g.entity)} (all units)` : " · whole tenant"}</span>
                  </span>))}
                </td>
                <td><div className="actions">
                  <button className="ghost small" onClick={() => setEditing({ email: p.email, grants: p.grants.map(g => ({ role: g.role, entity: g.entity || undefined, bu: g.bu || undefined })), isNew: false })}>Edit roles</button>
                  <button className="ghost small" onClick={() => run(async () => { const t = await central.memberToken(slug, p.email, "issued by admin", 30); showSecret({ label: `Token for ${t.user}`, value: t.secret }); })}>Issue token</button>
                  {p.email !== ctx.me.user.email && (removing === p.email
                    ? <><button className="danger small" onClick={() => run(async () => { await central.setUserRoles(slug, p.email, []); setRemoving(""); members.reload(); })}>Confirm remove</button>
                        <button className="ghost small" onClick={() => setRemoving("")}>Keep</button></>
                    : <button className="ghost small danger-text" title={`Removes all of ${p.email}'s roles in ${ctx.t.name}`} onClick={() => setRemoving(p.email)}>Remove</button>)}
                </div></td>
              </tr>))}
            </tbody>
          </table>
          <Pager offset={offset} limit={PAGE} total={rows.length} onPage={setOffset} />
        </>
      )}
    </div>
  );
}

function RoleEditor({ initial, entities, bus, self, onCancel, onSave }: {
  initial: { email: string; grants: Grant[]; isNew: boolean };
  entities: { slug: string; name: string }[]; bus: { slug: string; name: string; entity: string }[]; self: string;
  onCancel: () => void; onSave: (email: string, grants: Grant[]) => void;
}) {
  const [email, setEmail] = useState(initial.email);
  const [grants, setGrants] = useState<Grant[]>(initial.grants);
  const set = (i: number, g: Grant) => setGrants(grants.map((x, j) => (j === i ? g : x)));
  const dup = grants.some((g, i) => grants.findIndex(x => same(x, g)) !== i);
  const losingAdmin = email === self && initial.grants.some(g => g.role === "tenant_admin" && !g.entity && !g.bu) && !grants.some(g => g.role === "tenant_admin" && !g.entity && !g.bu);
  const removed = initial.grants.filter(g => !grants.some(x => same(x, g)));
  const added = grants.filter(g => !initial.grants.some(x => same(x, g)));

  return (
    <div className="inline-form">
      <h3 style={{ marginTop: 0 }}>{initial.isNew ? "Add a person" : `Roles of ${initial.email}`}</h3>
      {initial.isNew && <div style={{ maxWidth: 360 }}><label>Email</label><input autoFocus value={email} onChange={e => setEmail(e.target.value.trim())} placeholder="alice@example.com" /></div>}
      <table className="small">
        <thead><tr><th>Where</th><th>Role</th><th /></tr></thead>
        <tbody>{grants.map((g, i) => (
          <tr key={i}>
            <td><select value={scopeOf(g)} onChange={e => {
              const [kind, v] = e.target.value.split(":");
              const role = kind ? (scopedRoles.includes(g.role) ? g.role : "developer") : (tenantRoles.includes(g.role) ? g.role : "auditor");
              set(i, { role, ...(kind === "entity" ? { entity: v } : kind === "bu" ? { bu: v } : {}) });
            }}>
              <option value="">Whole tenant</option>
              {entities.map(e => (
                <optgroup key={e.slug} label={e.name}>
                  <option value={`entity:${e.slug}`}>{e.name} (all its business units)</option>
                  {bus.filter(b => b.entity === e.slug).map(b => <option key={b.slug} value={`bu:${b.slug}`}>{b.name}</option>)}
                </optgroup>))}
            </select></td>
            <td><select value={g.role} onChange={e => set(i, { ...g, role: e.target.value })}>
              {(scopeOf(g) ? scopedRoles : tenantRoles).map(r => <option key={r} value={r}>{r} — {roleHint[r]}</option>)}
            </select></td>
            <td><button className="ghost small" onClick={() => setGrants(grants.filter((_, j) => j !== i))}>Remove</button></td>
          </tr>))}
        </tbody>
      </table>
      <div className="row" style={{ margin: "8px 0" }}><button className="ghost small" onClick={() => setGrants([...grants, { role: "viewer", ...(entities[0] ? { entity: entities[0].slug } : {}) }])}>+ Add role</button></div>
      {dup && <div className="small del">The same role is listed twice.</div>}
      {losingAdmin && <div className="small del">You cannot remove your own tenant_admin role; another tenant admin has to.</div>}
      {!initial.isNew && (added.length > 0 || removed.length > 0) && (
        <p className="small muted">Saving {added.length > 0 && <>adds {added.map(g => g.role).join(", ")}</>}{added.length > 0 && removed.length > 0 && " and "}{removed.length > 0 && <>removes {removed.map(g => g.role).join(", ")}</>}.
          {grants.length === 0 && " The person loses access to this tenant."}</p>)}
      <div className="row">
        <button className="small" disabled={!/^[^@\s]+@[^@\s]+$/.test(email) || dup || losingAdmin || (initial.isNew && grants.length === 0) || (!initial.isNew && added.length === 0 && removed.length === 0)}
          onClick={() => onSave(email, grants.map(g => ({ role: g.role, ...(g.entity ? { entity: g.entity } : {}), ...(g.bu ? { bu: g.bu } : {}) })))}>Save</button>
        <button className="ghost small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
