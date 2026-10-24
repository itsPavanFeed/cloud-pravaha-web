// Client for Cloud Pravaha. Everything goes to the central plane: identity and
// the tenant directory directly, infrastructure through the wrapper at
// /api/v1/t/{tenant}/..., which forwards to that tenant's own backend.
// The token lives in sessionStorage only, so it is gone when the tab closes.

export type TenantRole = "tenant_admin" | "finops" | "security" | "auditor";
export type EntityRole = "admin" | "manager" | "developer" | "viewer";
export type Step = "manager" | "finops" | "security";

export interface MeBU { slug: string; name: string; roles: EntityRole[] } // effective roles (entity roles included)
export interface MeEntity { slug: string; name: string; roles: EntityRole[]; bus: MeBU[] }
export interface MeTenant { slug: string; name: string; tenant_roles: TenantRole[]; platform_admin?: boolean; entities: MeEntity[] }
export interface User { id: string; email: string; name: string; platform_admin: boolean }
export interface Me { user: User; tenants: MeTenant[] }

export interface CatalogInput {
  name: string; type: string; required?: boolean; description?: string; default?: unknown;
  pattern?: string; item_pattern?: string; allowed?: unknown[]; min?: number; max?: number; max_items?: number;
}
export interface CatalogModule {
  id: string; title: string; description: string; source: string; versions: string[]; cloud: string;
  providers: string[]; inputs: CatalogInput[]; enforced?: Record<string, unknown>; outputs: string[];
  dependencies?: { source: string; versions: string[] }[];
}
export interface Catalog { registry: string; modules: CatalogModule[]; providers: { source: string; version: string; cloud: string }[]; tofu_version: string }

export interface Connection { id: string; name: string; cloud: { provider: string; auth?: string; [k: string]: unknown }; entities: string[]; created_by: string; created_at: string }
export interface Environment {
  id: string; name: string; bu: string; entity: string; tier: "prod" | "nonprod"; connection?: string; connection_id?: string;
  cloud: { provider: string; auth?: string; [k: string]: unknown };
  runner_pool: string; max_destroys: number; allow_destroy: boolean; created_by: string; created_at: string;
}

export interface ModuleRef { name: string; module: string; version?: string; inputs?: Record<string, unknown> }
export interface StackSpec { modules: ModuleRef[]; outputs?: { name: string; module: string; output: string; sensitive?: boolean }[]; imports?: { to: string; id: string }[] }
export interface RunBrief { id: string; status: string; operation: string; created_at: string }
export interface Stack {
  id: string; name: string; bu: string; entity: string; environment: string; environment_id: string; spec: StackSpec;
  created_by: string; created_at: string; updated_at: string; last_run?: RunBrief;
  drift: { interval_minutes: number; auto_remediate: boolean; last_check?: string };
  managed_by: "ui" | "git"; source_ref?: string;
}
export interface ContractsConfig { provider: "github" | "gitlab" | "local"; repo: string; branch: string; path: string; api_url?: string; auth?: "token" | "github_app"; poll_seconds: number; auto_plan: boolean; auto_apply_low_risk: boolean; enabled: boolean }
export interface SyncResult { file?: string; stack?: string; action: string; run_id?: string; error?: string }
export interface ContractsState { config: ContractsConfig | null; token_set: boolean; status: { revision: string; synced_at: string; error?: string; results: SyncResult[] | null } }

export interface ResourceChange { address: string; type: string; actions: string[]; importing?: boolean; after?: Record<string, unknown> }
export interface Violation { rule: string; level: "hard" | "advisory"; address?: string; message: string }
export interface Approval { step: Step; approver: string; reason: string; created_at: string }
export interface Risk { level: "low" | "medium" | "high"; reasons: string[]; required_approvals: Step[] }
export interface CostEstimate { monthly_delta_usd: number; items: { address: string; type: string; monthly_usd: number; basis: string }[]; unpriced_resources: number; note: string }
export interface RiskSettings { large_change: number; prod_level: "medium" | "high"; cost_medium_usd: number; cost_high_usd: number; approvals: Record<"low" | "medium" | "high", Step[]> }
export interface Run {
  id: string; stack_id: string; stack: string; bu: string; entity: string; environment: string; operation: string; status: string;
  created_by: string; config_hash: string; plan_sha256?: string;
  plan_summary?: { add: number; change: number; destroy: number; replace: number; imports?: number; resources: ResourceChange[]; outputs?: string[]; drift?: ResourceChange[] };
  policy_result?: { passed: boolean; violations: Violation[] | null };
  risk?: Risk; cost?: CostEstimate; required_approvals: Step[]; approvals: Approval[];
  error?: string; created_at: string; updated_at: string; planned_at?: string; finished_at?: string;
}
export interface LogChunk { seq: number; ts: string; chunk: string }
export interface AuditEvent { id: number; ts: string; actor: string; action: string; target: string; scope?: string; payload: unknown; hash: string }
export interface Token { id: string; name: string; created_by: string; created_at: string; expires_at: string; last_used_at?: string; revoked_at?: string }
export interface Runner { id: string; name: string; pool: string; created_at: string; last_seen_at?: string; revoked_at?: string }
export interface StateVersion { serial: number; sha256: string; size: number; run_id?: string; created_at: string }
export interface Tenant { id: string; slug: string; name: string; backend_url: string; created_by: string; created_at: string }
export interface Entity { id: string; slug: string; name: string; created_by: string; created_at: string }
export interface PolicySet { id: string; name: string; scope: string; level: "hard" | "advisory"; module: string; enabled: boolean; created_by: string; updated_by: string; updated_at: string }
export interface BU { id: string; slug: string; name: string; entity: string; created_by: string; created_at: string }
export interface Membership { id: string; email: string; tenant: string; entity?: string; bu?: string; role: string; created_by: string; created_at: string }

export interface AssistantTurn { role: "user" | "assistant"; text: string }
export interface AssistantSource { id: string; kind: string; title: string }
export interface AssistantAnswer {
  text: string; sources: AssistantSource[]; declined?: boolean;
  draft?: { name: string; environment: string; spec: StackSpec };
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number; model_calls: number };
}

export interface GitHubIntegration {
  configured: boolean; private_key_set: boolean; webhook_secret_set: boolean; webhook_path: string;
  source: "env_file" | "database"; env_file?: string;
  config?: { app_id: number; installation_id?: number; api_url?: string; app_slug?: string };
}
export interface IntegrationCheck { name: string; status: "ok" | "warn" | "fail"; detail: string }
export interface WebhookDelivery { id: number; delivery_id: string; event: string; action: string; repo: string; ref: string; sender: string; outcome: string; detail: string; received_at: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: string[] = []) { super(message); }
}

const KEY = "pravaha.token";
export const session = {
  get: () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } },
  set: (t: string) => { try { sessionStorage.setItem(KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${session.get()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin", // the API authenticates with bearer tokens only; no cookies are set
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.details ?? []);
  return data as T;
}

// Central plane: identity and directory.
export const central = {
  authConfig: () => fetch("/api/v1/auth/config").then(r => r.json() as Promise<{ sso: boolean; label: string; webhook_base_url?: string }>),
  exchange: async (code: string) => {
    const r = await fetch("/api/v1/auth/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!r.ok) throw new ApiError(r.status, "This sign-in link has expired. Sign in again.");
    return (await r.json()) as { secret: string };
  },
  logout: () => call<void>("POST", "/api/v1/auth/logout"),
  me: () => call<Me>("GET", "/api/v1/me"),
  myTokens: () => call<Token[]>("GET", "/api/v1/me/tokens"),
  createMyToken: (name: string, ttl_days: number) => call<{ token: Token; secret: string }>("POST", "/api/v1/me/tokens", { name, ttl_days }),
  revokeMyToken: (id: string) => call<void>("DELETE", `/api/v1/me/tokens/${id}`),
  tenants: () => call<Tenant[]>("GET", "/api/v1/tenants"),
  onboard: (t: { slug: string; name: string; backend_url: string; server_ca_pem: string; admin_email: string }) =>
    call<{ tenant: Tenant; tenant_plane_settings: Record<string, string> }>("POST", "/api/v1/tenants", t),
  health: (t: string) => call<{ reachable: boolean; error?: string; reported_tenant?: string }>("GET", `/api/v1/tenants/${t}/health`),
  entities: (t: string) => call<Entity[]>("GET", `/api/v1/tenants/${t}/entities`),
  createEntity: (t: string, slug: string, name: string) => call<Entity>("POST", `/api/v1/tenants/${t}/entities`, { slug, name }),
  members: (t: string) => call<Membership[]>("GET", `/api/v1/tenants/${t}/members`),
  bus: (t: string) => call<BU[]>("GET", `/api/v1/tenants/${t}/bus`),
  createBU: (t: string, slug: string, name: string, entity: string) => call<BU>("POST", `/api/v1/tenants/${t}/bus`, { slug, name, entity }),
  addMember: (t: string, m: { email: string; role: string; entity?: string; bu?: string }) => call<Membership>("POST", `/api/v1/tenants/${t}/members`, m),
  removeMember: (t: string, id: string) => call<void>("DELETE", `/api/v1/tenants/${t}/members/${id}`),
  memberToken: (t: string, email: string, name: string, ttl_days: number) =>
    call<{ secret: string; user: string }>("POST", `/api/v1/tenants/${t}/tokens`, { email, name, ttl_days }),
};

// Tenant plane, through the wrapper. Each call names the tenant explicitly.
export const tenant = (t: string) => {
  const p = (path: string) => `/api/v1/t/${encodeURIComponent(t)}${path}`;
  return {
    catalog: () => call<Catalog>("GET", p("/catalog")),
    connections: () => call<Connection[]>("GET", p("/connections")),
    connection: (id: string) => call<{ connection: Connection; oidc?: { issuer: string; audience: string; subject_pattern: string } }>("GET", p(`/connections/${id}`)),
    createConnection: (c: { name: string; cloud: unknown; entities: string[] }) => call<Connection>("POST", p("/connections"), c),
    updateConnection: (id: string, c: { cloud: unknown; entities: string[] }) => call<Connection>("PUT", p(`/connections/${id}`), c),
    environments: () => call<Environment[]>("GET", p("/environments")),
    environment: (id: string) => call<{ environment: Environment; oidc?: { issuer: string; audience: string; subject_pattern: string } }>("GET", p(`/environments/${id}`)),
    createEnvironment: (e: unknown) => call<Environment>("POST", p("/environments"), e),
    stacks: () => call<Stack[]>("GET", p("/stacks")),
    stack: (id: string) => call<Stack>("GET", p(`/stacks/${id}`)),
    createStack: (s: { name: string; environment: string; spec: StackSpec }) => call<Stack>("POST", p("/stacks"), s),
    updateStack: (id: string, spec: StackSpec) => call<Stack>("PUT", p(`/stacks/${id}`), { spec }),
    preview: (s: { name: string; environment: string; spec: StackSpec }) =>
      call<{ valid: boolean; problems?: string[]; files?: Record<string, string>; providers?: string[]; hash?: string }>("POST", p("/stacks/preview"), s),
    stackRuns: (id: string) => call<Run[]>("GET", p(`/stacks/${id}/runs`)),
    stateVersions: (id: string) => call<StateVersion[]>("GET", p(`/stacks/${id}/state-versions`)),
    setDrift: (stackId: string, d: { interval_minutes: number; auto_remediate: boolean }) => call<Stack>("PUT", p(`/stacks/${stackId}/drift`), d),
    createRun: (stackId: string, operation: "apply" | "destroy" | "drift") => call<Run>("POST", p(`/stacks/${stackId}/runs`), { operation }),
    runs: () => call<Run[]>("GET", p("/runs")),
    run: (id: string) => call<Run>("GET", p(`/runs/${id}`)),
    logs: (id: string, after: number) => call<LogChunk[]>("GET", p(`/runs/${id}/logs?after=${after}`)),
    approve: (id: string, step: Step, reason: string) => call<Run>("POST", p(`/runs/${id}/approve`), { step, reason }),
    discard: (id: string, reason: string) => call<Run>("POST", p(`/runs/${id}/discard`), { reason }),
    audit: (q: string) => call<AuditEvent[]>("GET", p(`/audit?limit=200&q=${encodeURIComponent(q)}`)),
    verifyAudit: () => call<{ intact: boolean; checked: number; first_broken_id: number }>("GET", p("/audit/verify")),
    contracts: () => call<ContractsState>("GET", p("/contracts")),
    putContracts: (c: ContractsConfig) => call<ContractsConfig>("PUT", p("/contracts"), c),
    putContractsToken: (token: string) => call<void>("PUT", p("/contracts/token"), { token }),
    syncContracts: () => call<ContractsState["status"]>("POST", p("/contracts/sync")),
    policies: () => call<PolicySet[]>("GET", p("/policies")),
    createPolicy: (b: { name: string; scope: string; level: string; module: string; enabled: boolean }) => call<PolicySet>("POST", p("/policies"), b),
    updatePolicy: (id: string, b: { scope: string; level: string; module: string; enabled: boolean }) => call<PolicySet>("PUT", p(`/policies/${id}`), b),
    testPolicy: (module: string, run_id: string) => call<Violation[] | null>("POST", p("/policies/test"), { module, run_id }),
    riskSettings: () => call<RiskSettings>("GET", p("/settings/risk")),
    putRiskSettings: (r: RiskSettings) => call<RiskSettings>("PUT", p("/settings/risk"), r),
    assistantInfo: () => call<{ enabled: boolean; model: string }>("GET", p("/assistant")),
    // Streams status lines while the assistant works, then resolves with the answer.
    ask: async (question: string, history: AssistantTurn[], onStatus: (s: string) => void, signal?: AbortSignal): Promise<AssistantAnswer> => {
      const res = await fetch(p("/assistant/ask"), {
        method: "POST", signal, credentials: "same-origin", cache: "no-store",
        headers: { Authorization: `Bearer ${session.get()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error ?? res.statusText, data.details ?? []);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buf += value;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") onStatus(ev.text);
          else if (ev.type === "answer") return ev.answer as AssistantAnswer;
          else if (ev.type === "error") throw new ApiError(502, ev.error);
        }
        if (done) throw new ApiError(502, "the assistant stopped before answering");
      }
    },
    github: () => call<GitHubIntegration>("GET", p("/integrations/github")),
    putGitHub: (b: { app_id: string; installation_id: string; api_url: string; private_key: string; webhook_secret: string }) => call<GitHubIntegration>("PUT", p("/integrations/github"), b),
    deleteGitHub: () => call<void>("DELETE", p("/integrations/github")),
    testGitHub: () => call<{ checks: IntegrationCheck[] }>("POST", p("/integrations/github/test")),
    githubDeliveries: (before = 0, limit = 20) =>
      call<{ items: WebhookDelivery[]; next_before?: number }>("GET", p(`/integrations/github/deliveries?limit=${limit}${before ? `&before=${before}` : ""}`)),
    connectionsPage: (provider: "" | "aws" | "gcp" | "azure", limit: number, offset: number) =>
      call<{ items: Connection[]; total: number; counts: Record<string, number> }>("GET", p(`/connections?limit=${limit}&offset=${offset}${provider ? `&provider=${provider}` : ""}`)),
    runners: () => call<Runner[]>("GET", p("/runners")),
    createRunner: (r: { name: string; pool: string }) => call<{ runner: Runner; secret: string }>("POST", p("/runners"), r),
    revokeRunner: (id: string) => call<void>("DELETE", p(`/runners/${id}`)),
  };
};

// ---- role helpers (UI hints only; the tenant plane enforces) ----

// Platform admins hold tenant_admin and auditor in every tenant (but no approval roles).
export const has = (t: MeTenant | undefined, ...roles: TenantRole[]) =>
  !!t && roles.some(r => t.tenant_roles.includes(r) || (!!t.platform_admin && (r === "tenant_admin" || r === "auditor")));
export const allBUs = (t: MeTenant | undefined) => (t?.entities ?? []).flatMap(e => e.bus.map(b => ({ ...b, entity: e.slug, entityName: e.name })));
export const buRoles = (t: MeTenant | undefined, bu: string) => allBUs(t).find(b => b.slug === bu)?.roles ?? [];
export const canChange = (t: MeTenant | undefined, bu: string) =>
  !!t?.platform_admin || buRoles(t, bu).some(r => r === "admin" || r === "developer");
export const canApprove = (t: MeTenant | undefined, step: Step, bu: string) =>
  step === "manager" ? buRoles(t, bu).includes("manager") : !!t?.tenant_roles.includes(step as TenantRole);
export const writableBUs = (t: MeTenant | undefined) => allBUs(t).filter(b => canChange(t, b.slug));
