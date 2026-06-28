# Current CRM Walkthrough State

Last updated: 2026-06-29

This file prevents the CRM walkthrough from losing track while we test, fix, and document the restaurant workflows.

## Where We Are Now

We are in the manual CRM walkthrough for **Abdi Restaurant**.

The active scenario is:

```text
Scenario 4: Private dining / quote request -> create a Deal
```

Temporary blocker:

- Production session/login became unstable again during Scenario 4.
- The browser redirected to login.
- Email/password login returned `POST /api/auth/sign-in/email 500`.
- The login page has been simplified so it no longer makes a pre-login sign-out request.
- The auth route now logs Better Auth handler failures on the server so Vercel logs can reveal the real backend exception.
- CRM walkthrough should resume at Scenario 4 after production login is stable again.

Scenario 3 is completed. Scenario 4 is now in progress. The latest confirmed Scenario 4 result is:

- Staff created a private/family dinner deal from the customer request.
- The deal appears in the **Inquiry** column.
- The deal value is `CHF 720`.
- The pipeline forecast shows `Total open: CHF 720`.
- Staff sent an SMS follow-up from Inbox.
- The customer received the SMS on `+41762147690`.

So Scenario 4 has reached:

```text
Customer request -> CRM contact -> deal created -> SMS follow-up sent -> customer received SMS
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

Status: completed.

Confirmed behavior:

- Staff added a task in CRM.
- Staff sent an SMS follow-up from Inbox.
- Customer received the SMS.
- Staff completed the callback/follow-up task by clicking the tick/check box.
- The task was removed from the open follow-up queue.
- The duplicate/similar task completion fix is verified in production.

### Scenario 4: Private Dining / Quote Request

Status: in progress.

Confirmed behavior:

- Staff created `Family dinner for 12 people - Abdi Restaurant`.
- The deal is in the `Inquiry` stage.
- The deal amount is `CHF 720`.
- The pipeline forecast shows `CHF 720`.
- Staff sent a private-dinner SMS follow-up from Inbox.
- Customer received the SMS.
- Staff moved the deal from `Inquiry` to `Qualified`.
- Staff sent the customer a concrete family dinner offer by SMS:
  `For 12 guests on 2026-07-12 at 20:00, we can offer a shared family menu from around CHF 60 per person...`
- Staff reported that there was still no reliable way to move the deal to `Won` or `Lost`, and drag-and-drop was not reliable across all stages.

Next step:

- Redeploy the improved Deal Pipeline controls.
- Move the deal from `Qualified` to `Proposal`.
- If the customer accepts, move it to `Won` using either the stage dropdown or the Won button.
- If the customer refuses, move it to `Lost` using either the stage dropdown or the Lost button.
- Verify the card appears in the final Won/Lost column and the forecast updates.

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

### Expired session recovery

Problem:

- After refreshing CRM, some tRPC calls returned `UNAUTHENTICATED`.
- The dashboard shell could remain visible while contacts failed to load.
- Clicking notifications could lead back to login, and stale cookies could make the next login attempt unreliable.

Outcome:

- CRM now shows a clear "Your session expired" recovery panel instead of a generic failed-contacts error.
- The notification bell catches expired-session errors and shows a sign-in prompt instead of failing roughly.
- The login form now clears stale auth cookies before attempting a new email/password sign-in.
- The stale-cookie cleanup now sends a valid JSON `POST /api/auth/sign-out` request, fixing the production `415 Unsupported Media Type` regression seen before sign-in.

### Inbox load failure

Problem:

- After login, `/en/crm/inbox` showed "Could not load inbox. Please refresh."
- The browser console showed a 500 from the batched `inbox.listThreads` and `inbox.listAutomationIssues` tRPC call.
- Refreshing then redirected back to login, which made the Inbox failure and auth-session issue feel like one problem.

Outcome:

- Inbox thread listing no longer depends on a brittle raw SQL aggregation.
- Thread grouping now uses a safer Drizzle query and groups messages in application code.
- Automation issue lookup now tolerates old/null message metadata when checking whether an issue was dismissed.

### Deal pipeline movement

Problem:

- Deal cards showed a drag affordance, but dragging did not reliably move the deal.
- There was no stage/status fallback control for ordinary staff users.
- Won/Lost were still not available as explicit stage choices, so staff could move through normal stages but not confidently close a deal.

Outcome:

- Deal cards now include a stage dropdown for normal open stages.
- Deal cards include Previous/Next buttons for simple movement.
- Drag-and-drop now sends the dragged deal id through the browser drag event and routes Won/Lost drops through the correct business actions.
- Moving a deal reloads the pipeline forecast so totals stay accurate.
- Deal cards now include all stages in the dropdown, including Won and Lost.
- Choosing Won runs the safe `markWon` action; choosing Lost opens the lost-reason confirmation modal.
- Recently closed Won/Lost deals remain visible in the board so staff can see where the card landed.

## Notes Still To Improve

These are not forgotten. They should be handled as we continue the walkthrough and after the scenario documentation is complete.

- The contact drawer still shows too much activity noise. It should prioritize the latest customer request, current task, recommended next step, and recent customer/staff messages.
- Old notifications can remain visible after the staff has handled the work. Notifications need clearer lifecycle behavior: unread, read, handled, dismissed, expired.
- Inbox status sometimes needs refresh/update after an action. The UI should update more predictably after confirm/decline/cancel/send.
- The Inbox should show both customer and staff messages clearly, with better visual distinction and less confusion around old messages.
- Scenario documentation should include the actual screenshots from the user's walkthrough once each scenario is finished.

## Next Ordered Scenarios

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
