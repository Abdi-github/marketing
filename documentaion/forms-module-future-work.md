# Forms Module Future Work

Status: MVP/product-grade forms module is complete. This file tracks polish and future slices that are useful, but not required for the current core forms workflow.

## Current Completed Scope

- AI-assisted form creation.
- Manual visual form builder.
- Starter templates.
- Multi-step forms.
- Conditional fields.
- Required and optional fields.
- Text, email, phone, textarea, select, radio, checkbox, and number fields.
- Honeypot and optional Turnstile anti-spam.
- Public form rendering.
- Embeddable form rendering.
- Server-side validation and sanitization.
- Lead capture.
- CRM contact dedupe and linking.
- Form analytics.
- Submission inbox.
- Submission detail drawer.
- Submission status workflow.
- CSV export.
- Quick handoff actions for CRM, email, call, deals, segments, and sequences.

## Future Polish

### 1. Browser And Playwright Visual QA

Goal: verify the full forms workflow visually and prevent regressions.

Recommended checks:

- Create/edit a form from `/en/forms`.
- Apply each starter template.
- Save, reload, and confirm persistence.
- Submit a public or embedded form.
- Confirm the submission appears in the inbox.
- Open the submission drawer.
- Change submission status.
- Export CSV.
- Verify desktop and mobile layouts.

Why: typechecks prove the code compiles, but visual QA catches layout issues, broken drawers, disabled states, overflow, and route-level auth problems.

### 2. Dashboard i18n

Goal: move newly added English dashboard labels into locale message files.

Labels to localize include:

- Analytics
- Submissions
- Export CSV
- Starter templates
- Submission drawer labels
- Status labels: New, Contacted, Qualified, Archived
- Quick actions: Open CRM, Email lead, Call, Create deal, Add to segment, Start sequence

Why: the SaaS targets Swiss companies, so DE/FR/IT dashboard polish matters for credibility.

### 3. Status-Change Automations

Goal: allow operational workflows when a submission status changes.

Useful automations:

- When status becomes `contacted`, add a CRM note or activity.
- When status becomes `qualified`, suggest or create a deal.
- When status becomes `archived`, exclude the lead from follow-up sequences.
- Emit domain events for status changes, for example `lead.status_changed`.

Why: status changes should become workflow triggers, not just labels.

### 4. Deeper CRM Quick Actions

Goal: make handoff actions prefilled and context-aware.

Future improvements:

- Open the exact linked contact detail drawer/page instead of the CRM list.
- Prefill deal creation with contact, source form, and submitted answers.
- Add a lead to an existing or new segment directly from the submission drawer.
- Enroll the linked contact in a sequence directly from the drawer.
- Preserve return navigation back to the form submission.

Why: SMEs need fast follow-up. The fewer clicks between "new lead" and "next action", the more useful the product feels.

### 5. Submission Search And Pagination

Goal: make the inbox practical for high-volume forms.

Useful filters:

- Search by name, email, phone, or answer text.
- Filter by status.
- Filter by date range.
- Filter by linked/unlinked CRM contact.
- Add real pagination controls beyond the first page.

Why: the current inbox is enough for recent leads, but busy customers will need stronger retrieval.

### 6. Form-Level Automation Builder

Goal: let users configure what happens after each form is submitted.

Possible options:

- Notify internal email.
- Add CRM tag.
- Enroll in email sequence.
- Create deal.
- Send confirmation email.
- Send WhatsApp/SMS follow-up when enabled.

Why: forms become much more valuable when they feed automations automatically.

### 7. Better Export Options

Goal: make exports more flexible for business users.

Future options:

- Export selected date range.
- Export selected statuses.
- Export only visible columns.
- Include/exclude raw payload JSON.
- Scheduled export email.

Why: SMEs often need CSVs for accountants, staff, agencies, or offline workflows.

## Suggested Next Implementation Order

1. Add i18n for new dashboard labels.
2. Add Playwright visual tests for the form edit, submit, inbox, and drawer workflow.
3. Add exact CRM contact/deal prefill routes.
4. Add `lead.status_changed` event and automation hooks.
5. Add search, date filters, and pagination controls to submissions.
