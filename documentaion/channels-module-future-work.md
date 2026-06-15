# Channels Module Future Work

This file tracks channel and integration polish that should follow the queued sync foundation.

## Implemented Foundation

- Integration sync runs are persisted in `integration_sync_runs`.
- Manual sync requests enqueue `integrations.sync` jobs instead of calling provider APIs from tRPC.
- The worker records queued, running, success, partial, noop, and error states.
- The Integrations page shows connected count, attention count, last sync, active sync state, and recent sync history.

## High-Impact Next Slices

### Integration Health Center

- Add provider detail drawers with token health, required permissions, connected account/page/location, webhook status, and recovery actions.
- Add a "test connection" result that checks credentials and permissions without importing data.
- Add alert banners for expired tokens, repeated sync failures, and missing webhook configuration.

### Provider Data Cache

- Persist useful provider data instead of only counts:
  - POS menu/products/categories for Gastrofix and Lightspeed CH.
  - Reservations/bookings/classes for Gastrofix and Eversports.
  - Raw provider payload for audit/debugging.
- Use synced data to enrich social posts, landing-page menus, CRM segmentation, and email/WhatsApp campaigns.

### Webhook Hardening

- Ensure every provider webhook route persists the event and immediately enqueues processing.
- Resolve tenant ownership from provider account/location/phone IDs.
- Store processing failures, retry count, and dead-letter state.
- Add DB-level duplicate protection for inbound messages/events where provider IDs exist.

### Meta/Facebook/Instagram

- Add Facebook page picker when the user manages multiple pages.
- Persist OAuth state nonce with expiry and consume it once on callback.
- Redirect callback to the user's locale instead of always `/en/integrations`.
- Add permission health checks and token refresh worker.
- Make Instagram support explicit: only show as fully enabled after required scopes and App Review are configured.
- Add Meta Lead Ads webhook import into CRM/forms.

### WhatsApp

- Treat WhatsApp Business as a first-class channel instead of hiding it inside the generic Meta connection.
- Store phone number ID, access token, template namespace, and business account metadata explicitly.
- Add template management, opt-in/consent tracking, delivery/read receipts, and 24-hour reply-window enforcement.
- Add inbox quick replies and AI-assisted response suggestions.

### Google Business Profile

- Add OAuth connection, location selector, and permission health.
- Publish posts, offers, and events to Google Business Profile.
- Sync reviews and provide AI review-reply drafts.
- Add local SEO/profile completeness checklist for Swiss SMEs.

### bexio

- Add bexio OAuth/API connection.
- Import contacts, companies, products/services, invoices, and payment status.
- Trigger automations from invoice paid, overdue, or new customer events.
- Use bexio data for CRM enrichment and segmentation.

### UX Polish

- Replace the integrations page's inline styles with shared dashboard components once the design system stabilizes.
- Add tabs/filters: All, Connected, Needs attention, Marketing, POS, Booking, Messaging, Accounting.
- Add setup checklists per provider and clear "what this unlocks" explanations.
- Add event/sync logs with search and filtering.

### Security And Observability

- Add metrics for sync started/completed/failed by provider.
- Add provider outage/runbook links in the UI.
- Add credential rotation flow.
- Add rate-limit/backoff visibility per provider.
- Audit role boundaries for publishing and messaging actions.
