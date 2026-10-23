// Client for Cloud Pravaha. Everything goes to the central plane: identity and
// the tenant directory directly, infrastructure through the wrapper at
// /api/v1/t/{tenant}/..., which forwards to that tenant's own backend.
// The token lives in sessionStorage only, so it is gone when the tab closes.

export type TenantRole = "tenant_admin" | "finops" | "security" | "auditor";
export type EntityRole = "admin" | "manager" | "developer" | "viewer";
export type Step = "manager" | "finops" | "security";

export interface MeEntity { slug: string; name: string; roles: EntityRole[] }
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

export interface Environment {
  id: string; name: string; entity: string; tier: "prod" | "nonprod"; cloud: { provider: string; auth?: string; [k: string]: unknown };
  runner_pool: string; max_destroys: number; allow_destroy: boolean; created_by: string; created_at: string;
}

export interface ModuleRef { name: string; module: string; version?: string; inputs?: Record<string, unknown> }
export interface StackSpec { modules: ModuleRef[]; outputs?: { name: string; module: string; output: string; sensitive?: boolean }[] }
export interface RunBrief { id: string; status: string; operation: string; created_at: string }
export interface Stack {
  id: string; name: string; entity: string; environment: string; environment_id: string; spec: StackSpec;
  created_by: string; created_at: string; updated_at: string; last_run?: RunBrief;
}

export interface ResourceChange { address: string; type: string; actions: string[]; after?: Record<string, unknown> }
export interface Violation { rule: string; level: "hard" | "advisory"; address?: string; message: string }
export interface Approval { step: Step; approver: string; reason: string; created_at: string }
export interface Risk { level: "low" | "medium" | "high"; reasons: string[]; required_approvals: Step[] }
export interface Run {
  id: string; stack_id: string; stack: string; entity: string; environment: string; operation: string; status: string;
  created_by: string; config_hash: string; plan_sha256?: string;
  plan_summary?: { add: number; change: number; destroy: number; replace: number; resources: ResourceChange[]; outputs?: string[] };
  policy_result?: { passed: boolean; violations: Violation[] | null };
  risk?: Risk; required_approvals: Step[]; approvals: Approval[];
  error?: string; created_at: string; updated_at: string; planned_at?: string; finished_at?: string;
}
export interface LogChunk { seq: number; ts: string; chunk: string }
export interface AuditEvent { id: number; ts: string; actor: string; action: string; target: string; entity?: string; payload: unknown; hash: string }
export interface Token { id: string; name: string; created_by: string; created_at: string; expires_at: string; last_used_at?: string; revoked_at?: string }
export interface Runner { id: string; name: string; pool: string; created_at: string; last_seen_at?: string; revoked_at?: string }
export interface StateVersion { serial: number; sha256: string; size: number; run_id?: string; created_at: string }
export interface Tenant { id: string; slug: string; name: string; backend_url: string; created_by: string; created_at: string }
export interface Entity { id: string; slug: string; name: string; created_by: string; created_at: string }
export interface Membership { id: string; email: string; tenant: string; entity?: string; role: string; created_by: string; created_at: string }

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
  addMember: (t: string, m: { email: string; role: string; entity: string }) => call<Membership>("POST", `/api/v1/tenants/${t}/members`, m),
  removeMember: (t: string, id: string) => call<void>("DELETE", `/api/v1/tenants/${t}/members/${id}`),
  memberToken: (t: string, email: string, name: string, ttl_days: number) =>
    call<{ secret: string; user: string }>("POST", `/api/v1/tenants/${t}/tokens`, { email, name, ttl_days }),
};

// Tenant plane, through the wrapper. Each call names the tenant explicitly.
export const tenant = (t: string) => {
  const p = (path: string) => `/api/v1/t/${encodeURIComponent(t)}${path}`;
  return {
    catalog: () => call<Catalog>("GET", p("/catalog")),
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
    createRun: (stackId: string, operation: "apply" | "destroy") => call<Run>("POST", p(`/stacks/${stackId}/runs`), { operation }),
    runs: () => call<Run[]>("GET", p("/runs")),
    run: (id: string) => call<Run>("GET", p(`/runs/${id}`)),
    logs: (id: string, after: number) => call<LogChunk[]>("GET", p(`/runs/${id}/logs?after=${after}`)),
    approve: (id: string, step: Step, reason: string) => call<Run>("POST", p(`/runs/${id}/approve`), { step, reason }),
    discard: (id: string, reason: string) => call<Run>("POST", p(`/runs/${id}/discard`), { reason }),
    audit: (q: string) => call<AuditEvent[]>("GET", p(`/audit?limit=200&q=${encodeURIComponent(q)}`)),
    verifyAudit: () => call<{ intact: boolean; checked: number; first_broken_id: number }>("GET", p("/audit/verify")),
    runners: () => call<Runner[]>("GET", p("/runners")),
    createRunner: (r: { name: string; pool: string }) => call<{ runner: Runner; secret: string }>("POST", p("/runners"), r),
    revokeRunner: (id: string) => call<void>("DELETE", p(`/runners/${id}`)),
  };
};

// ---- role helpers (UI hints only; the tenant plane enforces) ----

// Platform admins hold tenant_admin and auditor in every tenant (but no approval roles).
export const has = (t: MeTenant | undefined, ...roles: TenantRole[]) =>
  !!t && roles.some(r => t.tenant_roles.includes(r) || (!!t.platform_admin && (r === "tenant_admin" || r === "auditor")));
export const entityRoles = (t: MeTenant | undefined, entity: string) => t?.entities.find(e => e.slug === entity)?.roles ?? [];
export const canChange = (t: MeTenant | undefined, entity: string) =>
  !!t?.platform_admin || entityRoles(t, entity).some(r => r === "admin" || r === "developer");
export const canApprove = (t: MeTenant | undefined, step: Step, entity: string) =>
  step === "manager" ? entityRoles(t, entity).includes("manager") : has(t, step as TenantRole);
export const writableEntities = (t: MeTenant | undefined) => (t?.entities ?? []).filter(e => canChange(t, e.slug));
