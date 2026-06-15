# Pre-Deployment Focus And Deferred Polish

Status: active scope-freeze note for the next stage.

Purpose: keep us disciplined before the boss demo and deployment. This file separates:

- what should still be finished before demo/deploy
- what is real product polish, but can safely wait until after the application is shown and deployed

## Recommendation

Yes, this is the right move.

We have already implemented a very large amount of product surface. At this point, the highest-value move is not to keep expanding features blindly. It is to:

1. stabilize the app
2. run final checks
3. deploy
4. show the product
5. come back to the deferred polish with fresh eyes and real feedback

That is a stronger business move than spending more time on non-blocking enhancements.

## Must Finish Before Demo Or Deployment

These are not "future polish". These are the remaining launch-readiness items that matter for trust, stability, or a clean demo.

### 1. Apply Pending Database Migration

- Apply `packages/db/migrations/0038_brand_asset_media_fields.sql`.

Why:

- The new brand `favicon_url` and `social_preview_url` fields were added in code and should be present in the database before deployment.

### 2. Run Final Browser Smoke Tests

Minimum manual or Playwright smoke:

- Login
- Dashboard load
- Landing page AI generation
- Landing page editor save/reload
- Public landing page render
- Social post generation
- Forms create/save/public submit
- CRM contacts/deals basic load
- Account brand/domain/billing/settings basic load

Why:

- Typechecks passing is excellent, but the boss demo depends on visible behavior, not only compile safety.

### 3. Verify Production Environment Configuration

Confirm the production deployment has the required env/config for the flows you intend to demo:

- database
- Redis
- object storage / Scaleway
- Stripe
- Resend
- Meta
- domain certificate provider if custom domains are part of the demo

Why:

- Several features are implemented correctly but still depend on real provider credentials and production wiring.

### 4. Decide Demo Scope Explicitly

For the boss demo, choose the flows we will confidently show:

- AI website generation and editing
- social post generation and creative preview
- forms and CRM handoff
- account/brand/domain readiness

Avoid live demoing unfinished provider-dependent flows unless production credentials and behavior are verified.

### 5. Final Regression Pass On Recent Media Work

Verify:

- landing editor `Media library` tab
- uploaded image reuse
- generated social graphics appearing in reusable media
- brand logo/favicon/social-preview upload

Why:

- This was one of the last large slices and should be sanity-checked in the real UI.

## Safe To Defer Until After Deployment

These are useful and real, but they do not need to block the demo if the core app works.

## Forms

- full dashboard i18n polish
- Browser/Playwright visual regression coverage
- status-change automations such as `lead.status_changed`
- deeper CRM quick actions from the submission drawer
- submission search, filters, and stronger pagination
- form-level automation builder
- richer export options

## CRM

- Browser/Playwright CRM visual QA
- task quick actions like draft message and create deal from task
- stale-deal and unanswered-inbox automations
- AI contact summary and next-best-action suggestions
- segmentation enhancements
- duplicate merge preview and audit trail
- CRM activity analytics
- final CRM i18n polish

## Account

- full account/dashboard i18n pass
- role-based UI affordances for non-admin users
- account audit log
- richer brand intelligence extraction from website/logo
- live brand previews across modules
- per-channel brand overrides
- domain health center and per-page domain assignment
- Stripe Customer Portal and richer Swiss billing details
- team management, notification preferences, security settings, API keys
- data export/erasure status UI

Note:

- The previous "brand upload through object storage" item is no longer future work at baseline level. Logo, favicon, and social preview uploads are now wired. Future work is the broader brand asset intelligence/library layer.

## Automation

- searchable pickers instead of UUID-style internal selection flows
- richer sequence builder UX
- list filters and pagination
- full i18n coverage
- more worker safety/retry/throttle logic
- provider-side sender-domain verification
- richer consent history
- branded email block builder
- branching, conditions, exit rules, re-entry rules
- queued AI generation for all automation authoring
- analytics and recommendations

## Channels

- integration health center
- provider data cache beyond sync counts
- webhook hardening and dead-letter visibility
- Meta page picker, locale-aware callback, token health, Lead Ads import
- first-class WhatsApp channel management
- Google Business Profile integration
- bexio integration
- integrations UX polish and observability improvements

## Landing Pages And Social Posts

- screenshot-based visual QA across style families and breakpoints
- regenerate-design-only action
- richer generated subpage copy
- deeper per-page SEO, OG, sitemap, schema data
- industry-specific content packs
- named snapshots/checkpoints/version history polish
- media library enrichment with tags, usage history, ownership metadata, and private/public lifecycle
- multi-slide social carousel generation
- scheduling calendar and recurring campaign ideas
- performance-informed next-post recommendations
- approval workflows
- creative template visual QA matrix
- cost/credit transparency in the UI
- platform-specific caption variants

Note:

- The old future-work item "backfill generated images into `media_assets`" is now largely addressed for the current baseline. Remaining work is richer lifecycle/search/metadata, not the initial durable storage path.

## Cross-Cutting Deferred Work

- full Browser/Playwright coverage across all modules
- complete hardcoded-label and i18n cleanup in DE/FR/IT/EN
- outbox/event transaction-boundary tightening
- classification of direct interactive AI calls vs queued AI calls
- Langfuse or equivalent AI observability completion
- broader production dashboards/alerts

## Suggested Immediate Order From Here

1. Apply the pending DB migration.
2. Run final smoke tests on the exact flows planned for the boss demo.
3. Fix only issues that break trust, stability, or the demo path.
4. Deploy.
5. Demo to your boss.
6. Return to the deferred polish list after real feedback.

## Practical Standard For "Good Enough To Demo"

The app is ready to show if:

- the main pages load reliably
- the core creation flows work end to end
- recent edits persist correctly
- there are no obvious broken routes, 500s, or fake-looking placeholder behavior in the demo path
- provider-backed features you show are actually configured and working

Everything else can be scheduled as post-demo product polish.
