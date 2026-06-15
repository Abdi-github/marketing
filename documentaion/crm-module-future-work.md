# CRM Module Future Work

Status: CRM core workflows are now product-grade for the current MVP. This file tracks useful polish and future slices that should be revisited after the current CRM contacts, deals, segments, inbox, duplicates, and tasks work.

## Current Completed Scope

- Contact list with search, tags, lifecycle filtering, sorting, pagination, and CSV export.
- Contact detail drawer with notes, tags, lifecycle stage, lead score, score sparkline, form submissions, and unified activity timeline.
- CRM contact dedupe from form submissions.
- Duplicate contact detection and merge workflow.
- Deals pipeline with tenant-safe contact linking.
- Segments with saved filters and bulk actions.
- Inbox foundation for WhatsApp, SMS, and email-style conversations.
- Unified CRM timeline across leads, events, scores, messages, deals, email sends, sequences, and tasks.
- Manual CRM tasks and follow-ups.
- Main CRM follow-up queue grouped into overdue, today, and upcoming.
- Task completion, due-date editing, priority editing, and snooze actions.
- Automatic high-priority follow-up tasks for new form leads with an email address.
- Tenant-safety hardening for CRM joins and destructive actions.

## Future Polish

### 1. Browser And Playwright Visual QA

Goal: verify the CRM workflows visually and prevent dashboard regressions.

Recommended checks:

- Open `/en/crm`.
- Search and filter contacts.
- Open a contact drawer.
- Add/remove tags.
- Edit notes and lifecycle stage.
- Create, complete, snooze, reprioritize, and delete tasks.
- Confirm the follow-up queue updates after drawer changes.
- Open deals, segments, inbox, and duplicates pages.
- Verify desktop and mobile layouts.

Why: typechecks prove the code compiles, but visual QA catches drawer layout issues, overflow, route-level errors, disabled states, and broken dashboard interactions.

### 2. Task Quick Actions

Goal: make the task queue a real daily work surface.

Future improvements:

- Draft email, SMS, or WhatsApp follow-up from a task.
- Create a deal directly from a task/contact.
- Add a contact to a segment from a task.
- Enroll a contact in a sequence from a task.
- Add task notes or outcome after completion.

Why: SMEs should be able to move from "what needs attention" to "done" without hunting through other modules.

### 3. Deal Automations

Goal: create follow-up tasks when deals need attention.

Useful automations:

- Create a task when a deal stays in one stage too long.
- Create a task when a deal has no activity for N days.
- Create a task before expected close date.
- Suggest next action when a deal moves stage.
- Add `deal.stage_stale` or `deal.follow_up_due` domain events.

Why: a CRM becomes much more valuable when it prevents missed revenue opportunities.

### 4. Inbox SLA And Follow-Up Automations

Goal: turn inbound messages into accountable work.

Useful automations:

- Create a task for unanswered inbound WhatsApp/SMS/email messages.
- Add response-time badges.
- Add "waiting for customer" and "needs reply" states.
- Route conversations by channel or urgency.
- Show inbox tasks in the main follow-up queue.

Why: many SME leads are lost because nobody replies fast enough.

### 5. AI Summaries And Next Best Action

Goal: help users understand a contact quickly.

Future improvements:

- AI contact summary from timeline, notes, lead source, messages, and deals.
- Suggested next action.
- Suggested tags or lifecycle stage.
- Suggested deal value or service interest from form payloads.
- Guardrails so AI suggestions are never applied without user confirmation.

Why: the CRM already has rich context; summarizing it saves time and makes the product feel intelligent.

### 6. Segmentation Enhancements

Goal: make segments more actionable and easier to trust.

Useful improvements:

- Preview matching contacts before saving a segment.
- Show segment size trend.
- Add rules for task status, deal stage, last message, lead source, and form answers.
- Add "copy segment" and "archive segment".
- Add bulk action history.

Why: segments should drive campaigns, sequences, and follow-up workflows, not just act as saved filters.

### 7. Duplicate Merge UX Polish

Goal: make duplicate handling safer and clearer.

Future improvements:

- Field-by-field merge preview.
- Allow user to choose winning value for name, phone, notes, and tags.
- Show related leads, messages, deals, and tasks before merge.
- Add undo/audit trail for merge operations.

Why: merges are destructive and trust-sensitive; operators need confidence before committing.

### 8. CRM Activity Analytics

Goal: show whether follow-up work is actually happening.

Useful metrics:

- Open tasks by age.
- Overdue task count.
- Lead response time.
- Deal follow-up latency.
- Tasks completed per week.
- Conversion rate by source form or landing page.

Why: operators need visibility into process quality, not just stored records.

### 9. Dashboard i18n Polish

Goal: ensure all CRM dashboard labels are clean in DE, FR, IT, and EN.

Areas to review:

- Contacts page.
- Detail drawer.
- Deals pipeline.
- Segments.
- Inbox.
- Duplicate merge UI.
- Task queue and task actions.

Why: the product targets Swiss companies, so CRM language quality affects credibility.

## Suggested Next Implementation Order

1. Add Playwright visual tests for contacts, task queue, and drawer workflows.
2. Add task quick actions for draft message and create deal.
3. Add unanswered inbox message tasks.
4. Add stale deal follow-up tasks.
5. Add AI contact summary and next-best-action suggestions.
6. Add duplicate merge preview and audit trail.
7. Add CRM activity analytics.
