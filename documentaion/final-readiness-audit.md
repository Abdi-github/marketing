# Final Readiness Audit

Status: completed initial audit.

Purpose: verify the whole SaaS foundation before implementing the remaining polish items in `documentaion/`.

## Audit Scope

- Build and type safety.
- Test health.
- Database and migration health.
- Tenant isolation.
- Domain-event and queue safety.
- AI workflow architecture.
- Browser and visual QA.
- i18n completeness.
- Security, compliance, and production readiness.
- Documentation consistency.

## Automated Checks

| Check                            | Status | Notes                                                                                                                                                                                                 |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@marketing/ai-router` typecheck | Pass   | `pnpm.cmd --filter @marketing/ai-router exec tsc --noEmit` completed successfully.                                                                                                                    |
| `@marketing/web` typecheck       | Pass   | `pnpm.cmd --filter @marketing/web exec tsc --noEmit` completed successfully.                                                                                                                          |
| `@marketing/workers` typecheck   | Pass   | `pnpm.cmd --filter @marketing/workers exec tsc --noEmit` completed successfully.                                                                                                                      |
| `@marketing/ai-router` tests     | Pass   | `pnpm.cmd --filter @marketing/ai-router test`: 6 files passed, 122 tests passed, 1 skipped.                                                                                                           |
| Web production build             | Pass   | Fixed stale `.next`/orphaned process state, removed invalid local `NODE_ENV`, resolved build lint and Suspense prerender errors. `pnpm.cmd --filter @marketing/web build` now completes successfully. |
| Worker build/type safety         | Pass   | Covered by workers typecheck in this audit. Run a separate worker production build before deployment.                                                                                                 |

## Heuristic Safety Scans

| Scan                          | Status | Notes                                                                                                                                                                                           |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation scan         | Warn   | RLS policies are present across migrations, and most app queries include tenant filters. Direct `db.*` calls remain in routers/workers and should stay under focused review when touched.       |
| Event/outbox safety scan      | Warn   | Outbox is used broadly. Some outbox writes are direct and not always transactionally coupled to the state change that caused them.                                                              |
| Direct AI provider usage scan | Warn   | Worker-side provider use is expected. Several tRPC routers still call provider factories directly for interactive AI helpers; classify or move heavier ones to queues.                          |
| Production stub scan          | Warn   | The first object-storage upload path is wired, and custom-domain certs now use a worker/provider path. Production still needs provider configuration plus remaining integration/Langfuse stubs. |
| i18n key scan                 | Warn   | Locale files exist for EN/DE/FR/IT, but newer dashboard/editor labels still need a focused hardcoded-label pass.                                                                                |

## Browser QA Matrix

These require a running local app, seeded data, and preferably Playwright/browser execution.

Status: partially completed. The in-app Browser instance and Playwright MCP tools were not exposed as callable tools in this Codex session, but HTTP smoke checks against the production server passed:

- `GET /en` -> 200.
- `GET /en/login` -> 200.
- `GET /api/health` -> 200 with DB and Redis `ok`.
- `GET /en/dashboard` -> 307 unauthenticated redirect.

- Auth: signup, login, logout, forgot password.
- Account: overview, brand kit, domains, billing, settings.
- Landing pages: wizard, website generation, campaign generation, editor, publish, public render, multilingual switcher.
- Social posts: caption generation, image generation, designed graphic generation, preview, Meta publish fallback/error states.
- Forms: template creation, AI creation, manual builder, public submit, inbox, drawer, CSV export.
- CRM: contacts, detail drawer, tasks, deals, segments, inbox, duplicates.
- Automation: email template, test send, sequence creation, enrollment, unsubscribe/preference center.
- Channels: connect/disconnect, sync runs, health/error states.

## Production Readiness Items

- Configure production custom-domain certificate provider and alert routing for renewal failures.
- Complete media durability: generated-image backfill, delete lifecycle, private asset access, and a reusable media library.
- Stripe Customer Portal and Swiss invoice details.
- Resend provider-side SPF/DKIM/return-path status checks.
- Meta OAuth/App Review/permission health checks.
- Queue dashboards/alerts for failed jobs.
- Full dashboard i18n for DE, FR, IT, EN.
- Account audit log for sensitive changes.

## Findings

### Resolved - Web Build And Local Responsiveness

Resolved on 2026-06-15. The root causes were stale Next dev/build processes holding generated `.next` files, `NODE_ENV=development` in `apps/web/.env.local`, obsolete ESLint disable comments for plugins not loaded by the flat ESLint config, and two client pages using `useSearchParams()` without Suspense boundaries. Production build now passes, and the production server responds on the core smoke routes.

### P0 - Browser QA Not Yet Verified

Visual QA is still pending because the in-app Browser was unavailable. Use Playwright or the Browser plugin once available to verify auth, account, landing pages, social posts, forms, CRM, automation, channels, and public pages across desktop/mobile.

### P1 - Production Infrastructure Stubs

The following are not production-complete:

- Custom domains: certificate issuance and renewal now run through `domains.cert.provision`; production must set `DOMAIN_CERT_PROVIDER=fly` or `webhook` and route alerts for expiring/failed renewals.
- `packages/shared/src/langfuse.ts`: Langfuse is a no-op stub, leaving AI observability incomplete.
- `apps/workers/src/queues/integration-sync/worker.ts`: unsupported providers throw unimplemented sync errors instead of provider-specific degraded states.
- `apps/web/src/app/api/integrations/lightspeed-ch/webhook/route.ts`: webhook route returns a placeholder 501.
- `packages/integrations/gastrofix/handlers.ts` and `packages/integrations/eversports/handlers.ts`: MVP stub handlers remain.

### P1 - Queue And Event Consistency

The project uses the outbox pattern, but not every outbox write is visibly transaction-coupled to the state change that caused it. The social post worker explicitly notes a crash-window tradeoff around `first_post_at` and outbox writes. Keep the current implementation for design-partner scale if acceptable, but tighten before broader launch.

### P1 - AI Workflow Boundary

Several tRPC routers still create AI providers directly for interactive helper flows, including contacts, content, copilot, experiments, forms, landing pages, segments, and sequences. This does not mean every call is wrong, but it should be audited against the queue-driven AI ADR. Heavy, retryable, or expensive AI tasks should move to queued workers; fast UI helper calls should be documented as explicit exceptions.

### P1 - Media Durability

Initial durable media plumbing shipped on 2026-06-15: `media_assets` stores tenant-scoped object keys, the uploads router creates Scaleway S3 presigned PUT URLs, uploaded images complete into an `uploaded` status, and `/api/media/assets/[assetId]` serves public assets through the app. Remaining work: generated social/background image backfill, delete lifecycle, private asset authorization, media reuse/search, and a first-class media library shared by landing pages, social posts, brand assets, and forms.

### P2 - i18n Completion

The app has EN/DE/FR/IT message files, but recent dashboard work introduced many new labels. Run a final dashboard i18n pass for account, channels, CRM, forms, automation, landing pages, and social posts before Swiss customer demos.

### P2 - Documentation Follow-Up

`docs/EVENTS.md` still calls the event catalog a stub. Update it with the current event types and ownership boundaries after the outbox consistency pass.

## Recommended Next Order

1. Configure and test the production custom-domain certificate provider, then wire alert routing for renewal failures.
2. Build the media library layer on top of `media_assets` and backfill generated social/background images into object storage.
3. Run Browser/Playwright smoke across the matrix above once the browser tools are callable.
4. Classify direct AI calls and move heavyweight tRPC AI work into queues.
5. Tighten outbox transaction boundaries for launch-critical workflows.
6. Complete i18n and documentation polish.
