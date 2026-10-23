import { useState } from "react";
import { central, type Me } from "../api";
import { Copy, ErrorBox, Loading, Time, useLoad } from "../ui";

export default function Account({ me }: { me: Me }) {
  const tokens = useLoad(central.myTokens);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  return (
    <>
      <div className="head"><div><h1>My tokens</h1><div className="muted">{me.user.email}. Tokens are stored hashed, expire within 90 days and are shown once.</div></div></div>
      {secret && <div className="notice"><strong>New token</strong> — copy it now.<div className="row" style={{ marginTop: 8 }}><div className="secret" style={{ flex: 1 }}>{secret}</div><Copy text={secret} /><button className="ghost small" onClick={() => setSecret("")}>Done</button></div></div>}
      <ErrorBox error={error} />
      <div className="panel">
        <div className="row">
          <input style={{ maxWidth: 220 }} placeholder="name, e.g. laptop or ci" value={name} onChange={e => setName(e.target.value)} />
          <input style={{ maxWidth: 110 }} type="number" min={1} max={90} value={days} onChange={e => setDays(Number(e.target.value))} />
          <span className="muted small">days</span>
          <button disabled={!name} onClick={() => run(async () => { const t = await central.createMyToken(name, days); setSecret(t.secret); setName(""); tokens.reload(); })}>Create token</button>
        </div>
      </div>
      {!tokens.data ? <Loading /> : (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Name</th><th>Issued by</th><th>Expires</th><th>Last used</th><th /></tr></thead>
            <tbody>{tokens.data.map(t => (
              <tr key={t.id}><td>{t.name}</td><td className="small">{t.created_by}</td><td>{new Date(t.expires_at).toLocaleDateString()}</td><td><Time iso={t.last_used_at} /></td>
                <td>{t.revoked_at ? <span className="badge idle">revoked</span> : <button className="danger small" onClick={() => run(async () => { await central.revokeMyToken(t.id); tokens.reload(); })}>Revoke</button>}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
