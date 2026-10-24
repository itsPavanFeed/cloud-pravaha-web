# cloud-pravaha-web

The Cloud Pravaha console: React + TypeScript, built with Vite. Its only runtime dependencies are `react` and `react-dom`, pinned exactly.

The console talks only to the central plane. Infrastructure pages go through the wrapper (`/api/v1/t/{tenant}/…`) to the selected tenant's own backend. A tenant switcher and an entity / business-unit filter in the sidebar scope every page.

| Page | What you can do |
| --- | --- |
| Stacks | The tenant's stacks you can see, by business unit, with their last run |
| New stack | Pick an environment in a unit where you are a developer, choose catalog modules, and fill forms generated from their input schemas. Wire modules through outputs and preview the generated OpenTofu |
| Stack | Plan changes or a destroy, edit the spec, see runs and encrypted state versions |
| Run | Risk level and reasons, the approval chain (manager, FinOps, Security) with only the steps you may sign, live logs, plan, policy, discard |
| Module catalog | Approved modules grouped by provider, versions, inputs and enforced baselines |
| Environments | Each BU's environments: cloud connection, tier (prod raises risk), runner pool and guardrails |
| Cloud connections | The tenant's AWS accounts, GCP projects and Azure subscriptions, which entities may use them, and the OIDC issuer, audience and subject to trust |
| Audit log | The tenant's hash-chained log, filtered to what your roles may see; chain verification for tenant-wide roles |
| Assistant | Ask about modules, policies, approvals and your stacks. Answers cite their sources. A drafted stack opens in the stack editor for review; the assistant never creates or applies anything. If the tenant plane has it switched off, the page says how to enable it |
| Tenant settings | (tenant admins) Backend health over mTLS, the entity → BU tree, people and roles at tenant, entity or BU scope, first tokens, risk policy, runners |
| Platform | (platform admins) Onboard tenants and check their backends |
| My tokens | Create and revoke your own API tokens |

## Develop

```bash
npm ci
PRAVAHA_API=http://127.0.0.1:8090 npm run dev   # proxies /api to a running control plane
npm run build                                    # outputs dist/, which the control plane serves (PRAVAHA_WEB_DIR)
```

The easiest backend for development is `../cloud-pravaha-backend/scripts/dev-up.sh`. It starts central and a tenant, seeds a person per role, and serves this app. Point `PRAVAHA_API` at central.

## Security notes

- The API token is kept in `sessionStorage`, so it is cleared when the tab closes. It is sent only as a bearer header; the API sets no cookies.
- The control plane serves the app with a strict CSP (`default-src 'self'`, no inline scripts), `X-Frame-Options: DENY` and `no-referrer`.
- Secrets (new tokens, runner tokens) are shown once and never stored by the UI.
