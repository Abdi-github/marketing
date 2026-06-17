# Copilot Browser QA Handoff

Purpose: give the next GitHub Copilot agent a grounded, low-hallucination briefing so it can verify the application feature-by-feature through browser interaction as if it were a human user.

This document is for:

- browser-driven QA
- golden-path walkthroughs
- bug reproduction
- regression checking before demo or deployment

This document is not a replacement for the ADRs or architecture docs. It is the practical handoff for an agent that needs to open the app, click through it, and verify what is real.

## 1. What This Product Is

This repository is a multi-tenant AI marketing automation SaaS for Swiss and European SMEs, with a beachhead in:

- cafes
- restaurants
- fitness studios
- service businesses

The product helps a business owner do four core jobs:

1. generate marketing content with AI
2. generate websites or campaign pages with AI
3. capture leads and manage them in a lightweight CRM
4. manage brand, domains, billing, integrations, and automation from one dashboard

The positioning is local-first and Swiss-credible:

- DE-CH first, with FR, IT, and EN support
- CHF-aware billing
- Swiss/EU data posture
- Swiss-business-friendly integrations and workflows

## 1A. Recommended Demo Business For End-To-End QA

Use this business as the default test persona unless there is a strong reason to use another one:

- **Business type:** restaurant
- **Working name:** Abdi Restaurant
- **Location:** Neuchatel, Switzerland
- **Primary offer:** dine-in meals, seasonal menu, takeaway, reservations, and special events
- **Main goals:** reservations, lead capture, special-offer promotion, and repeat visits
- **Primary audience:** local residents, couples, families, and tourists visiting Neuchatel

Why this business is the best single end-to-end QA persona:

- it fits the current product beachhead directly
- it works naturally with website generation
- it works naturally with forms and CRM
- it works naturally with email follow-up and offers
- it works naturally with social post creation
- it is easy for a human reviewer to understand
- it aligns better with the currently supported restaurant/cafe-style flows than a hotel would

Recommended brand direction for this business:

- tone: warm, modern, local, trustworthy
- visual style: inviting food photography, clean layouts, subtle premium feel
- likely pages: Home, About, Menu, Reservations, Contact
- likely form use cases: reservation request, private event inquiry, newsletter signup
- likely social post topics: seasonal dishes, weekend offers, event nights, chef specials, customer experience

If a second vertical is needed later for extra stress testing, use:

- **Abdi Cafe** in Neuchatel, Switzerland

Do not use a hotel as the primary QA persona unless the task specifically requires it, because the current product structure is more directly aligned with restaurant/cafe generation than hotel-specific flows.

The default browser QA and documentation pass should use **Abdi Restaurant** first.

## 2. What The Application Does Today

At a high level, the app already includes:

- authentication and tenant-based workspaces
- dashboard and account surfaces
- AI social post generation
- AI website / landing page generation and editing
- public website rendering
- forms and public form embeds
- CRM contacts, deals, inbox, duplicates, and segments
- email templates and sequences
- integrations and sync monitoring
- custom domains
- billing
- ops / admin pages

## 3. Architectural Truths The Agent Must Respect

These are non-negotiable. Do not invent around them.

### Multi-tenant by design

Every persisted business object is tenant-scoped. If a bug suggests cross-tenant leakage, treat it as severe.

### AI work is usually queue-driven

Heavy AI tasks are expected to enqueue work and then poll for result states. The agent should not assume that every AI action is synchronous.

### Vendor SDKs are abstracted

AI provider calls go through the internal provider layer. If behavior seems odd, inspect the provider abstraction and worker flow rather than assuming the UI prompt alone is the issue.

### Safe registered rendering

The website generator does not use raw arbitrary JSX generation as the core rendering model. It uses deterministic recipes, registered section variants, and safe composition data.

## 4. Repo Shape

Main app surfaces:

- `apps/web`: Next.js application, UI, auth, tRPC, public render routes
- `apps/workers`: BullMQ workers for AI and background jobs

Core packages:

- `packages/ai-router`: prompt registry, provider router, queue schemas, design-plan and design-recipe logic
- `packages/auth`: Better Auth setup
- `packages/billing`: Stripe and usage controls
- `packages/db`: schema and migrations
- `packages/integrations`: external provider adapters
- `packages/landing-design-system`: themes, palettes, bundles, visual helpers
- `packages/tenancy`: tenant context and isolation helpers

## 5. Important Product Modules

### A. Account

Sub-features:

- account overview
- brand
- domains
- billing
- settings / setup

Purpose:

- make the workspace production-ready
- manage brand identity used by AI features
- manage canonical domains and business configuration

### B. Landing Pages / Websites

Sub-features:

- built-in templates
- AI wizard
- website generation
- campaign page generation
- visual editor
- public preview and public published routes
- theme and section customization
- multilingual support

Purpose:

- generate credible small-business websites and campaign pages
- allow structured visual editing without breaking renderer safety

### C. Social Posts

Sub-features:

- post text generation
- graphic generation
- preview
- Meta / Facebook publishing flow

Purpose:

- generate business-ready posts with caption plus creative asset

### D. Forms

Sub-features:

- form builder
- public form endpoints
- submission handling
- CRM handoff

Purpose:

- capture leads from websites and embeds

### E. CRM

Sub-features:

- contacts
- deals
- segments
- inbox
- duplicates

Purpose:

- manage leads and basic sales / follow-up operations inside the same tenant workspace

### F. Automation

Sub-features:

- email templates
- sequences

Purpose:

- create reusable outbound or follow-up communication flows

### G. Channels

Sub-features:

- integrations
- sync runs

Purpose:

- connect external business systems and monitor channel health

### H. Ops

Sub-features:

- operator tenant views
- metrics

Purpose:

- platform-level operations for super-admin users

## 6. Browser QA Mission For The Next Agent

The next Copilot agent should behave like a careful human tester using browser automation, not like a code-only reviewer.

The mission is:

1. open the app
2. sign in with seeded users when possible
3. navigate each module end-to-end
4. try realistic user actions
5. verify visible outcomes
6. record failures with exact reproduction steps
7. only then inspect code for root cause

The agent should prefer visible interaction over assumptions.

The agent should use the recommended demo business from section 1A as the main narrative and test persona across features unless a route or feature explicitly requires another vertical.

## 7. Safe Test Accounts

The repo includes seeded E2E users used by Playwright setup.

Known local test users:

- cafe owner
  - email: `cafe-owner@e2e.test`
  - password: `E2eTestPass1!`
- restaurant owner
  - email: `restaurant-owner@e2e.test`
  - password: `E2eTestPass1!`
- super admin
  - email: `super-admin@e2e.test`
  - password: `E2eTestPass1!`

Use these first for local QA instead of creating random new users.

Source of truth:

- `apps/web/e2e/global-setup.ts`
- `apps/web/e2e/fixtures/auth.ts`

Note:

- these seeded accounts are primarily for local browser verification
- production or preview environments may not contain the same users

## 8. URLs And Route Conventions

Typical local base URL:

- `http://localhost:3000`

Locale-aware app routes:

- `/en/...`
- `/de/...`
- `/fr/...`
- `/it/...`

Important route families:

- marketing: `/<locale>`
- auth: `/<locale>/login`, `/<locale>/signup`
- dashboard home: `/<locale>/dashboard`
- posts: `/<locale>/dashboard/posts`, `/<locale>/dashboard/posts/new`
- landing pages: `/<locale>/landing-pages`, `/<locale>/landing-pages/new`, `/<locale>/landing-pages/new/wizard`
- forms: `/<locale>/forms`
- crm: `/<locale>/crm`
- integrations: `/<locale>/integrations`
- account: `/<locale>/account`
- domains: `/<locale>/domains`
- billing: `/<locale>/billing`
- ops: `/<locale>/ops`

Public website routes:

- `/p/<tenantSlug>/<pageSlug>`
- `/p/<tenantSlug>/<pageSlug>/<sitePageSlug>`

Draft preview routes:

- `/p/preview/page/<pageId>`
- `/p/preview/page/<pageId>/<sitePageSlug>`

## 9. Local Environment Caveats

The agent must not hallucinate environment behavior.

Important local realities:

- local dev commonly runs on `localhost:3000`
- dev cache can become stale; `.next` corruption has happened before
- database schema drift can happen if a migration exists but was not really applied
- preview and production deployments may point at a different database than local

Important recent example:

- `0038_brand_asset_media_fields.sql` existed but was missing from Drizzle journal metadata, so the migration file was present while the column did not exist in the DB

Lesson:

- never trust migration presence alone
- verify the actual database schema if runtime errors say a column is missing

## 10. Known Product Behavior Patterns

### AI website generation

- website generation may take time because copy, layout, and publish are queued
- the app is designed to generate websites by default, not navbar-less single-page output
- generated pages use a design-plan and deterministic design recipe layer
- visible style differences may come from recipe families, not arbitrary code generation

### Multilingual websites

- language switching is not just a UI toggle; localized content must actually exist per language
- if one locale edits correctly and another does not reflect it, treat that as a real product bug

### Social graphics

- some features depend on external providers and object storage
- a plain or weak creative result is not automatically a UI bug; it may be prompt quality, image workflow, or provider behavior

### Forms and CRM

- public form submission should be checked end-to-end: submit -> persisted lead -> CRM visibility

## 11. Priority Scenario Matrix

The next agent should test in roughly this order.

### P0: auth and shell

1. open marketing home
2. open login page
3. log in
4. confirm redirect to dashboard
5. log out
6. sign up only if needed, not as first choice

### P0: account readiness

1. open account overview
2. open brand page
3. verify brand save/load
4. open domains
5. open billing
6. open setup/settings

### P0: landing page generation

1. open landing pages list
2. open AI wizard
3. generate a website for Abdi Restaurant
4. wait for completion realistically
5. open editor
6. confirm navbar exists
7. confirm multiple pages resolve without 404
8. edit hero / section / theme
9. reload editor and confirm persistence
10. open public preview

### P0: social posts

1. open post creation page
2. generate text
3. generate graphic
4. verify preview is visible
5. verify download or image route works
6. only test publishing if credentials are confirmed valid

### P0: forms and CRM handoff

1. create or open a form
2. save it
3. submit via public route or embed route as a realistic Abdi Restaurant customer or reservation lead
4. confirm the lead appears in CRM contacts or the forms submission surface

### P1: CRM

1. contacts list
2. contact detail or drawer
3. deals page
4. segments
5. inbox
6. duplicates

### P1: automation

1. email templates list
2. template detail
3. email settings
4. sequences list
5. sequence creation/edit flow

### P1: integrations

1. integrations list
2. provider cards render
3. sync run history renders
4. health/status messaging is sensible

### P1: ops

1. log in as super admin
2. open ops
3. open ops metrics
4. confirm tenant list and metrics render

## 12. How The Agent Should Judge Success

A feature should be treated as working only if:

- the route loads
- the UI renders coherently
- the primary action can be completed
- the result is visible after the action
- the result persists after refresh when persistence is expected
- no broken links or obvious placeholder nonsense appear in the main user path

Do not mark a feature as healthy just because:

- the page returns HTTP 200
- the component compiles
- the route exists
- an API returns something

Visible behavior matters more than static code confidence.

## 13. No-Hallucination Rules For The Next Agent

The next agent should explicitly follow these rules:

1. Do not assume a feature works because the code looks finished.
2. Do not assume a failed route is a frontend bug before checking auth, DB schema, and env state.
3. Do not assume production and local use the same database.
4. Do not assume provider-backed features are configured just because the UI exists.
5. Do not assume queued AI work is broken if it is merely slow; inspect actual status and logs.
6. Do not assume all labels, translations, or locales are complete.
7. Do not invent missing flows; report what is visibly implemented.

## 14. Useful Docs To Read Before Testing

Must-read:

- [docs/PRODUCT_STRATEGY.md](../docs/PRODUCT_STRATEGY.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [memory/STEP.md](../memory/STEP.md)
- [documentaion/pre-deployment-focus-and-deferred-polish.md](pre-deployment-focus-and-deferred-polish.md)
- [documentaion/final-readiness-audit.md](final-readiness-audit.md)

If testing a specific area, also read:

- forms: [documentaion/forms-module-future-work.md](forms-module-future-work.md)
- crm: [documentaion/crm-module-future-work.md](crm-module-future-work.md)
- automation: [documentaion/automation-module-future-work.md](automation-module-future-work.md)
- account: [documentaion/account-module-future-work.md](account-module-future-work.md)
- channels: [documentaion/channels-module-future-work.md](channels-module-future-work.md)
- landing and social: [documentaion/landing-and-social-modules-future-work.md](landing-and-social-modules-future-work.md)

## 15. Recommended Defect Report Format

For each bug, the next agent should capture:

- module
- route
- user role used
- exact steps
- expected behavior
- actual behavior
- whether it reproduces after refresh
- whether it reproduces locally, in preview, or both
- likely layer:
  - auth
  - routing
  - frontend state
  - server query
  - migration/schema
  - queue/worker
  - provider/integration

Example:

```md
### Bug: Account overview crashes on brand query

- Module: account
- Route: `/en/account`
- User: cafe-owner@e2e.test
- Steps:
  1. log in
  2. open account
- Expected:
  account overview loads
- Actual:
  PostgresError: column "favicon_url" does not exist
- Reproduces after refresh: yes
- Scope: local and preview
- Likely layer: migration/schema drift
```

## 16. What To Avoid During Browser QA

Unless the user explicitly asks for it, the next agent should avoid:

- destructive deletes of meaningful user data
- random production signups
- repeated billing mutations
- publishing to real external channels unnecessarily
- changing domain or integration settings without need

Prefer:

- seeded local accounts
- local environment first
- preview environment second
- production only for targeted confirmation

## 17. Documentation Output Required From The Next Agent

The next Copilot agent should not only test features. It should also produce simple human-readable documentation while testing.

For each major feature it verifies, it should prepare a document that explains:

1. what the feature does
2. how Alpine Flow Studio would use it
3. what benefit the business gets from it
4. what inputs or data were used during testing
5. what outputs or results were produced
6. what related features connect to it
7. what common user scenarios or variations matter
8. what limitations, caveats, or failed cases were found

The writing style must be:

- simple English
- easy for a non-technical person to understand
- concrete, not abstract
- based on what was actually seen in the app

The purpose of this documentation is:

- you should understand the feature clearly
- your boss should understand the feature clearly
- another user should understand what value the feature gives a real business

### Required Documentation Perspective

The documentation should explain each feature through the recommended business persona:

- Abdi Restaurant

That means the next agent should explain things like:

- how Abdi Restaurant would set up its brand
- how it would generate its website
- how it would collect reservations and leads
- how those leads move into CRM
- how it would send follow-up emails or promotions
- how it would create social posts
- how domains, billing, and integrations support the business

### Required Data Story

The agent should use consistent sample business data when testing and documenting, such as:

- business name
- city
- service list
- trainer names
- trial offer
- contact form examples
- lead examples
- social campaign examples

This makes the documentation easier to follow from beginning to end.

### Required Visuals

The agent should include visuals where possible:

- screenshots
- simple workflow diagrams
- step-by-step flow graphics

The visuals should show:

- how a feature works
- how features connect together
- what the user sees before and after an action

Examples:

- account setup -> brand -> domain -> website generation
- public form submit -> CRM contact -> follow-up sequence
- social post generation -> preview -> publish flow
- AI website wizard -> editor -> public preview

The goal is not fancy design. The goal is clarity.

## 18. Current Strategic State

The application is feature-rich and close to demo/deployment readiness, but the remaining highest-value work is not blind feature expansion. It is:

1. realistic browser verification
2. regression fixing
3. deployment confidence
4. selective polish after feedback

That means the next agent should prioritize truth-finding over invention.

## 19. Recommended Kickoff Prompt For The Next Copilot Agent

Use a prompt close to this:

```md
Read `documentaion/copilot-browser-qa-handoff.md` and use it as the ground truth for this task.

Your mission is to verify the application feature-by-feature through browser interaction as if you were a real user using MCP browser tooling.

Start with local `http://localhost:3000`, use seeded test accounts where applicable, and work through the priority scenario matrix in the handoff document.

Use the recommended demo business from the handoff:

- Abdi Restaurant
- Neuchatel, Switzerland
- restaurant

While testing each major feature, also prepare simple human-readable documentation that explains:

- what the feature does
- how this business would use it
- what benefit it gets
- what data was used in testing
- what outputs were produced
- how the feature connects to other features

Include screenshots and simple workflow visuals where possible.

For every issue you find:

- reproduce it clearly
- state the route, role, and exact steps
- classify the likely layer
- fix it only after confirming the visible behavior

Do not assume features work because code exists. Prefer visual verification over static reasoning.
```
