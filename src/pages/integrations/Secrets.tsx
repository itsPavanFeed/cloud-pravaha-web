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
  const setup = `# OpenBao / Vault: trust this tenant's issuer for runs (no Vault token is stored by the platform)
bao auth enable -path=${mount} jwt
bao write auth/${mount}/config oidc_discovery_url="${d.issuer}" bound_issuer="${d.issuer}"
bao write auth/${mount}/role/${v.role || "pravaha"} role_type=jwt user_claim=sub \\
    bound_audiences="${aud}" bound_claims_type=glob \\
    bound_claims='{"sub":"pravaha:entity:*"}' token_ttl=15m token_policies=pravaha-read`;

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
        <h2>Set up the store</h2>
        <p className="muted small">Configure JWT auth to trust this tenant's issuer. The token's <span className="mono">sub</span> is <span className="mono">pravaha:entity:&lt;entity&gt;:env:&lt;env&gt;:stack:&lt;stack&gt;:phase:&lt;plan|apply&gt;</span>, so policies can be scoped to exactly the stacks that need a secret.</p>
        <dl className="kv">
          <dt>Issuer</dt><dd className="mono">{d.issuer} <Copy text={d.issuer} /></dd>
          <dt>JWKS</dt><dd className="mono">{d.jwks_url} <Copy text={d.jwks_url} /></dd>
        </dl>
        <pre className="code">{setup}</pre>
        <Copy text={setup} />
      </div>
    </>
  );
}
