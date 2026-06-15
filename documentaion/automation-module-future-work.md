# Automation Module Future Work

## Current State

The automation module has the core MVP primitives:

- Email templates with subject, plain text, generated HTML, merge variables, preview, AI draft, and test send.
- Email sequences with trigger event, status, JSONB steps, manual enrollment, and active enrollment counts.
- A BullMQ tick worker that enrolls contacts from outbox events and sends due sequence emails through Resend or sandbox mode.
- Resend webhooks for delivered/opened/clicked/bounced/complained events, with CRM activity event writes for opens and clicks.
- Email suppression tracking for unsubscribe, bounce, and complaint safety. Sequence emails include unsubscribe links, bounced/complained contacts are suppressed automatically, and suppressed contacts are skipped by the sender.
- A public email preference center for sequence recipients. Recipients can opt out and opt back in after a normal unsubscribe, while bounced and complained addresses remain hard-suppressed.
- Tenant sending-domain ownership verification. Tenants can add a sending domain, verify a deterministic TXT record, mark a verified domain as primary, and use that primary sender for template tests and sequence sends.

## Near-Term Polish

- Replace every internal UUID input with searchable pickers for contacts, templates, segments, and sequences.
- Add sequence timeline UX with drag-and-drop steps, template preview, wait labels, and broken-step warnings.
- Add filters and pagination to template and sequence lists once tenants have many automations.
- Add full i18n coverage for all new automation dashboard labels.
- Add Browser/Playwright visual QA for template creation, sequence creation, manual enrollment, and webhook status display.

## Reliability And Safety

- Keep the `lead.captured` event contract aligned with CRM contact creation so lead-triggered automations always receive or can resolve `contactId`.
- Validate tenant ownership for all sequence template IDs, sequence IDs, contact IDs, and enrollment writes.
- Prevent deleting templates that are referenced by sequence steps or past sends.
- Add unit tests around trigger filtering, outbox enrollment, idempotency, missing contacts/templates, and failed Resend sends.
- Add a retry/backoff strategy for failed sends so one provider outage does not create noisy duplicate failed rows.
- Add per-tenant send throttles and daily safety limits.

## Compliance And Deliverability

- Store richer consent source, consent timestamp, and unsubscribe timestamp per contact beyond the current email-level preference record.
- Wire sender-domain verification into the email provider's real domain API so SPF/DKIM/return-path status is checked, not only tenant DNS ownership.
- Replace the placeholder SPF instruction with provider-specific records once Resend domain-management APIs are added behind an integration abstraction.
- Expand compliant footer blocks with business name and physical address.

## Builder Enhancements

- Add a branded email builder with reusable blocks: hero, offer, button, product grid, testimonial, appointment CTA, footer.
- Add mobile/email-client preview modes and spam/accessibility checks.
- Add variable fallbacks such as `{{first_name | default:"there"}}`.
- Add preheader text, preview inbox card, and subject-line variants.
- Add template cloning and reusable vertical presets.

## Automation Logic

- Add triggers for segment entered, form submitted, deal stage changed, appointment booked/missed, review requested, inactive customer, and event attendance.
- Add conditions and branching: opened, clicked, no click, no reply, lead score threshold, lifecycle stage, tag present, or segment membership.
- Add exit rules such as "exit when deal won", "exit when contact unsubscribes", or "exit when appointment booked".
- Add re-entry rules and cooldown periods instead of a permanent one-enrollment-per-sequence constraint.
- Add manual sequence enrollment from contact detail, segment actions, form submissions, and deal views.

## AI Enhancements

- Move template and sequence AI generation into queued AI workflows, matching ADR-0002.
- Generate full sequences with actual templates, not only suggested subject lines.
- Let AI create variants for different goals: welcome, nurture, quote reminder, appointment reminder, review request, seasonal offer, winback.
- Use brand profile, CRM segment context, business locale, and previous performance to personalize outputs.
- Add AI quality checks for compliance, repetition, tone, spam risk, and missing CTA.

## Analytics

- Add sequence-level metrics: enrolled, completed, exited, sent, delivered, opened, clicked, bounced, complained, unsubscribed.
- Add step-level drop-off and conversion metrics.
- Attribute email clicks to CRM events, deals, appointments, landing-page visits, and form submissions.
- Add dashboard recommendations like "Step 2 has low click rate; try a shorter CTA."

## Recommended Implementation Order

1. Add provider-side sender-domain provisioning/status checks for SPF/DKIM/return-path.
2. Store richer contact-level consent timestamps and consent source history.
3. Move template and sequence AI generation to queued workflows.
4. Add branded email builder and analytics.
5. Add branching conditions, exit rules, and re-entry cooldowns.
6. Add per-tenant send throttles and richer worker retry/backoff.
