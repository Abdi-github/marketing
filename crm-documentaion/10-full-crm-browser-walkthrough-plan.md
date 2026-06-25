# 10. Full CRM Browser Walkthrough Plan

This plan defines the complete browser demonstration that should be run for Abdi Restaurant.
Each scenario should be recorded with screenshots and simple explanations for a non-technical
restaurant owner.

## Why This Exists

The CRM should not be explained as a table of contacts. It should be demonstrated as the daily work
system for the restaurant:

- customers ask questions or request a booking,
- the website captures the request,
- the CRM creates the customer record and staff task,
- automation acknowledges the customer,
- staff confirms, replies, or follows up,
- the business learns which customers can be invited back later.

## Scenario Order

### 1. Complete Reservation Request

Goal: show the simplest customer-to-staff workflow.

Steps:

1. Customer opens the published restaurant website.
2. Customer submits name, phone, email, date, time, party size, and SMS preference.
3. Staff sees a notification.
4. Staff opens the contact from the notification.
5. Staff reviews the reservation task and latest timeline.
6. Staff marks the task complete only after replying or confirming.

Screenshots:

- customer page before form
- filled form
- submit success
- dashboard notification bell
- selected CRM contact
- contact task/timeline area

### 2. Missing Reservation Details

Goal: show that incomplete leads still become organized work.

Steps:

1. Customer submits a reservation without time or party size.
2. CRM saves the lead as `missing_details`.
3. Staff sees a higher-priority follow-up.
4. Staff sends or drafts a message asking for missing details.
5. When details arrive, staff updates the request and confirms.

Screenshots:

- incomplete customer form
- missing-details notification
- Inbox or CRM task explaining what is missing
- staff reply area

### 3. Callback Request

Goal: show that not every lead is a booking.

Steps:

1. Customer asks the restaurant to call back.
2. CRM creates a callback task.
3. Staff sees the phone number and best time.
4. Staff marks the call complete after action.

Screenshots:

- callback form/input
- callback task
- completed task state

### 4. Private Dining Or Quote Request

Goal: show how larger business opportunities move toward Deals.

Steps:

1. Customer asks about a group dinner or private event.
2. CRM classifies it as a quote/private dining opportunity.
3. Staff creates a Deal from the contact.
4. Staff uses deal stages to track proposal, negotiation, won, or lost.

Screenshots:

- quote/private dining request
- contact record
- deal pipeline
- deal detail or stage movement

### 5. Inbox Reply And Two-Way Follow-Up

Goal: show customer replies becoming staff work.

Steps:

1. Customer replies by SMS, WhatsApp, or email.
2. Inbox shows the message thread.
3. Staff replies from the Inbox.
4. CRM timeline records the message history.

Screenshots:

- Inbox thread list
- selected conversation
- staff reply composer
- contact timeline message entry

### 6. AI-Assisted Follow-Up

Goal: show how AI helps staff write better replies without taking over.

Steps:

1. Staff opens a contact with a recent lead.
2. Staff clicks the AI follow-up draft action.
3. AI drafts a reply based on business context and lead details.
4. Staff reviews and edits before sending.

Screenshots:

- AI draft button
- generated draft
- edited staff-ready reply

### 7. Email Or SMS Sequence Enrollment

Goal: show automation after the first staff action.

Steps:

1. Staff creates or opens a restaurant follow-up sequence.
2. Sequence trigger targets booking, quote, or callback leads.
3. Staff enrolls a contact or verifies automatic enrollment.
4. Timeline shows sequence state.

Screenshots:

- sequence builder
- trigger/filter settings
- contact enrollment state
- timeline sequence event

### 8. Segments For Future Marketing

Goal: show how the restaurant can reuse CRM data later.

Steps:

1. Staff creates or opens a segment for reservation leads.
2. Staff filters by tag, lifecycle stage, or source.
3. Segment becomes a future audience for email/SMS campaigns.

Screenshots:

- segment list
- segment filter
- matching contacts

### 9. Duplicate Handling

Goal: show how repeated customers are kept clean.

Steps:

1. Customer submits again with the same phone or similar name.
2. Duplicates page shows possible matches.
3. Staff reviews before merging.
4. Merge keeps history and avoids losing data.

Screenshots:

- duplicate group
- primary contact selection
- merge confirmation

## Improvements Found Before Full Run

Already fixed:

- repeated reservation task creation now updates an existing open workflow task for the contact,
- CRM open-task list groups old duplicate tasks,
- selected CRM contact now displays a plain banner so staff understand details are open.

Still recommended:

- add a dedicated reservation detail panel with fields such as date, time, party size, status, and
  confirm/decline buttons,
- add a one-click `Create deal from this request` action on high-value leads,
- add a one-click `Add to reservation leads segment` action,
- add filters in Inbox for `Awaiting confirmation`, `Missing details`, and `Failed sends`,
- add stronger browser-demo controls so each scenario can resume after a page or browser hang.

## Execution Rule

Run each scenario as a separate browser script. A hang in one scenario should not stop the rest of
the walkthrough. Every script must write:

- a JSON result file,
- numbered screenshots,
- observed outcome,
- issues or improvements found.
