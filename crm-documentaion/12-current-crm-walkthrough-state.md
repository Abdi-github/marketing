# Current CRM Walkthrough State

Last updated: 2026-06-28

This file prevents the CRM walkthrough from losing track while we test, fix, and document the restaurant workflows.

## Where We Are Now

We are in the manual CRM walkthrough for **Abdi Restaurant**.

The active scenario is:

```text
Scenario 3: Callback / staff follow-up request
```

The customer submitted a request that needed staff action. Staff opened the CRM, added a task, used the Inbox, and sent an SMS follow-up. The latest confirmed result is:

- Staff typed/pasted into the Inbox composer without the page crashing.
- Staff sent the SMS from the Inbox.
- The customer received the SMS on `+41762147690`.
- Staff tried to mark the callback task complete, but the CRM still showed an open similar task. This exposed a task-completion issue.

So the current scenario has reached:

```text
Customer lead -> CRM task -> Inbox follow-up SMS -> Customer received SMS -> task completion issue found
```

## Completed Scenarios And Steps

### Scenario 1: Complete Reservation Request

Status: completed.

Confirmed behavior:

- Customer form submission created a CRM contact/lead.
- Tenant received in-app notification.
- Tenant received staff SMS notification.
- Staff confirmed the reservation.
- Customer received reservation confirmation SMS.
- CRM/Inbox showed confirmed reservation state after refresh/update.

### Scenario 2: Reservation With Missing Details

Status: completed.

Confirmed behavior:

- Customer submitted an incomplete reservation.
- CRM marked it as missing details / needing staff action.
- Staff asked for missing details by SMS.
- Customer replied by SMS.
- Inbound Twilio webhook was configured and inbound customer SMS appeared in the Inbox.
- Staff confirmed after receiving enough details.
- Customer received confirmation SMS.

### Scenario 3: Callback / Staff Follow-Up Request

Status: in progress, task completion fix implemented and ready to verify after redeploy.

Confirmed behavior:

- Staff added a task in CRM.
- Staff sent an SMS follow-up from Inbox.
- Customer received the SMS.
- Completing one duplicate/similar task could leave another similar task open, which made the CRM feel like the staff action did not work.

Next step:

- Redeploy the task-completion fix, then mark the callback/follow-up task as complete again.
- Confirm the task disappears from open follow-up queue or clearly changes state.
- Check the contact timeline records the completed staff action.

## Fixes Already Made During This Walkthrough

### Generated public forms

Problem:

- Some generated page buttons did not submit forms or did nothing.

Outcome:

- Public form submission now works again.

### Staff SMS alerts

Problem:

- Production form submissions created CRM records but staff SMS alerts were not always sent.

Outcome:

- Staff SMS notification was confirmed working in production.

### Twilio inbound replies

Problem:

- Customer SMS replies reached Twilio but did not appear in the app.

Outcome:

- Twilio Messaging Service webhook was configured.
- Inbound customer replies now appear in Inbox.

### Manual Inbox SMS sending

Problem:

- Manual Inbox SMS messages stayed `queued`; Twilio had no new outbound log.

Outcome:

- Manual Inbox replies now send directly through the platform SMS provider and record status immediately.
- Customer received the manual SMS.

### Inbox composer crash

Problem:

- Typing or pasting into the Inbox SMS reply field crashed the page with a client-side React `removeChild` error.

Outcome:

- Inbox composer no longer updates React state on every keystroke.
- Dynamic Inbox areas are marked `translate="no"` / `notranslate`.
- Typing and pasting no longer crash the page.

### Duplicate task completion

Problem:

- Similar CRM tasks for the same customer/request were grouped in the queue, but completing one task did not complete the matching duplicate tasks.
- The staff could check a task as done and still see another copy of the same work in the queue.

Outcome:

- Completing an open CRM task now completes matching duplicate tasks for the same customer, title, and workflow kind.
- The follow-up queue reloads after completion so the open-task count is truthful.

## Notes Still To Improve

These are not forgotten. They should be handled after the current walkthrough scenario is finished.

- The contact drawer still shows too much activity noise. It should prioritize the latest customer request, current task, recommended next step, and recent customer/staff messages.
- Old notifications can remain visible after the staff has handled the work. Notifications need clearer lifecycle behavior: unread, read, handled, dismissed, expired.
- Inbox status sometimes needs refresh/update after an action. The UI should update more predictably after confirm/decline/cancel/send.
- The Inbox should show both customer and staff messages clearly, with better visual distinction and less confusion around old messages.
- Scenario documentation should include the actual screenshots from the user's walkthrough once each scenario is finished.

## Next Ordered Scenarios

After Scenario 3 is fully closed:

1. Scenario 4: Private dining / quote request -> create a Deal.
2. Scenario 5: Inbox reply and follow-up -> show daily conversation workflow.
3. Scenario 6: Segments for reservation leads.
4. Scenario 7: Duplicates and returning customers.
5. Scenario 8: Email or SMS sequence follow-up.

## Rule For The Assistant

At the start of every CRM walkthrough response, state:

```text
Current scenario:
Current step:
What the user has already confirmed:
Next action:
```

Do not jump to another scenario until the current one is explicitly finished.
