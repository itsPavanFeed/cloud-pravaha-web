import { useState } from "react";
import type { Ctx } from "../../App";
import type { SecretStore } from "../../api";
import { Copy, ErrorBox, Loading, useLoad } from "../../ui";

// The tenant's secret store (OpenBao or HashiCorp Vault). Contracts reference
// secrets (vault://mount/path#key); runs read them at plan time with their own
// short-lived token through Vault's JWT auth method. No Vault credential is
// stored anywhere in the platform.
export default function Secrets({ ctx }: { ctx: Ctx }) {
  const st = useLoad(ctx.api.secretStore, [ctx.t.slug]);
  const [edit, setEdit] = useState<SecretStore | null>(null);
  const [test, setTest] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  if (!st.data) return st.error ? <ErrorBox error={st.error} /> : <Loading />;
  const d = st.data, saved = d.config;
  const editing = edit !== null || !saved;
  const v = edit ?? saved ?? { address: "", auth_mount: "jwt", role: "pravaha", namespace: "", audience: "" };
  const aud = v.audience || "pravaha-vault";
  const mount = v.auth_mount || "jwt";
  const pemFile = `pravaha-${ctx.t.slug}-issuer.pem`;
  const role = v.role || "pravaha";
  const steps: { title: string; note: string; code: string }[] = [
    { title: "1. Install the OpenBao CLI and point it at your server",
      note: "On macOS: brew install openbao (the command is bao). The HashiCorp vault CLI works too: replace bao with vault. Use an admin token of your own; it is never given to Cloud Pravaha.",
      code: `brew install openbao\nexport BAO_ADDR=${v.address || "https://bao.example.internal:8200"}\nexport BAO_TOKEN=<your admin token>\nbao status` },
    { title: "2. A KV v2 secrets engine and a read-only policy for runs",
      note: "Skip the first line if a kv engine already exists. Narrow the path to the secrets runs may read.",
      code: `bao secrets enable -path=kv kv-v2\nbao policy write pravaha-read - <<'EOF'\npath "kv/data/*" { capabilities = ["read"] }\nEOF` },
    { title: `3. Trust ${ctx.t.name}'s issuer (JWT auth)`,
      note: "Save the public key below as " + pemFile + ". Using the key directly works even when OpenBao cannot reach the issuer. If OpenBao can reach it over trusted TLS, oidc_discovery_url=\"" + d.issuer + "\" is an alternative that follows key rotation.",
      code: `bao auth enable -path=${mount} jwt\nbao write auth/${mount}/config bound_issuer="${d.issuer}" jwt_validation_pubkeys=@${pemFile}\nbao write auth/${mount}/role/${role} - <<'EOF'\n{"role_type": "jwt", "user_claim": "sub", "bound_audiences": ["${aud}"],\n "bound_claims_type": "glob", "bound_claims": {"sub": "pravaha:entity:*"},\n "token_ttl": "15m", "token_policies": ["pravaha-read"]}\nEOF` },
    { title: "4. Store a secret and reference it from a contract",
      note: "Contracts then use secretRef: vault://kv/payments/orders-db#password",
      code: `bao kv put kv/payments/orders-db password='<the password>'` },
  ];

  return (
    <>
      <ErrorBox error={error} />
      <div className="panel">
        <div className="drill-head">
          <div><h2>Secret store <span className="muted small">OpenBao / HashiCorp Vault (KV v2)</span></h2>
            <div className="muted small">Contracts never hold secrets: they reference them as <span className="mono">secretRef: vault://&lt;mount&gt;/&lt;path&gt;#&lt;key&gt;</span>. Each run logs in with its own short-lived token from {ctx.t.name}'s OIDC issuer, issued only for the store's audience, and reads the secret at plan time.</div></div>
          {saved && !editing && <div className="row">
            <button className="ghost" onClick={() => run(async () => setTest(await ctx.api.testSecretStore()))}>Test connection</button>
            <button onClick={() => setEdit(saved)}>Edit</button></div>}
        </div>
        {test && <div className={test.ok ? "notice" : "error"}>{test.ok ? `Reachable, unsealed${test.version ? ` (version ${test.version})` : ""}.` : test.error}</div>}
        {!editing && saved ? (
          <dl className="kv">
            <dt>Address</dt><dd className="mono">{saved.address}</dd>
            <dt>JWT auth</dt><dd className="mono">auth/{saved.auth_mount || "jwt"} · role {saved.role}{saved.namespace ? ` · namespace ${saved.namespace}` : ""}</dd>
            <dt>Token audience</dt><dd className="mono">{d.audience}</dd>
          </dl>
        ) : (
          <>
            <div className="grid">
              <div><label>Address</label><input value={v.address} placeholder="https://bao.acme.internal:8200" onChange={e => setEdit({ ...v, address: e.target.value })} /></div>
              <div><label>JWT auth mount</label><input value={v.auth_mount ?? ""} placeholder="jwt" onChange={e => setEdit({ ...v, auth_mount: e.target.value })} /></div>
              <div><label>Role</label><input value={v.role} onChange={e => setEdit({ ...v, role: e.target.value })} /></div>
              <div><label>Namespace <span className="muted">(optional)</span></label><input value={v.namespace ?? ""} onChange={e => setEdit({ ...v, namespace: e.target.value })} /></div>
              <div><label>Token audience <span className="muted">(default pravaha-vault)</span></label><input value={v.audience ?? ""} placeholder="pravaha-vault" onChange={e => setEdit({ ...v, audience: e.target.value })} /></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => run(async () => { await ctx.api.putSecretStore({ ...v, auth_mount: v.auth_mount || undefined, namespace: v.namespace || undefined, audience: v.audience || undefined }); setEdit(null); setTest(null); st.reload(); })}>Save</button>
              {saved && <button className="ghost" onClick={() => setEdit(null)}>Cancel</button>}
              {saved && <button className="ghost danger" onClick={() => run(async () => { await ctx.api.deleteSecretStore(); setEdit(null); st.reload(); })}>Remove</button>}
            </div>
          </>
        )}
      </div>
      <div className="panel">
        <h2>Set up OpenBao for {ctx.t.name}</h2>
        <p className="muted small">Runs log in with a token whose <span className="mono">sub</span> is <span className="mono">pravaha:entity:&lt;entity&gt;:env:&lt;env&gt;:stack:&lt;stack&gt;:phase:&lt;plan|apply&gt;</span> and audience <span className="mono">{aud}</span>, so the role and policies can be narrowed to exactly the stacks that need a secret.</p>
        {steps.map(st => (
          <div key={st.title} style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><strong>{st.title}</strong><Copy text={st.code} /></div>
            <p className="small muted" style={{ margin: "2px 0 6px" }}>{st.note}</p>
            <pre className="code">{st.code}</pre>
          </div>
        ))}
        {d.public_key_pem && (
          <div>
            <div className="row" style={{ justifyContent: "space-between" }}><strong>Issuer public key <span className="mono small muted">{pemFile}</span></strong><Copy text={d.public_key_pem} /></div>
            <pre className="code">{d.public_key_pem}</pre>
          </div>
        )}
        <dl className="kv"><dt>Issuer</dt><dd className="mono">{d.issuer}</dd><dt>JWKS</dt><dd className="mono">{d.jwks_url}</dd></dl>
      </div>
    </>
  );
}
