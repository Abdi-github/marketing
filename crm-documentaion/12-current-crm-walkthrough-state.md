# Current CRM Walkthrough State

Last updated: 2026-06-29

This file prevents the CRM walkthrough from losing track while we test, fix, and document the restaurant workflows.

## Where We Are Now

We are in the manual CRM walkthrough for **Abdi Restaurant**.

The active scenario is:

```text
Scenario 6: Segments and reusable customer lists
```

Latest Scenario 6 checkpoint:

- Staff created a segment named `Reservation guests`.
- Staff added the `reservation-guest` tag to the contact.
- The tag is visible in the contact list and in the contact drawer.
- The first export was empty because the segment rule still matched `lifecycle_stage = lead`, but the contact had already moved to `customer`.
- A fix has now been implemented so Segments supports practical restaurant tag-based rules:
  - `Customer tag has tag "reservation-guest"`
  - restaurant shortcut: `Reservation guests`
  - restaurant shortcut: `SMS customers`
  - restaurant shortcut: `Private dining leads`
  - restaurant shortcut: `Confirmed reservation customers`
- The plain-English generator now maps reservation/booking/table prompts to the `reservation-guest` tag instead of only lifecycle status.

Next Scenario 6 action after the updated app is deployed or restarted:

1. Open **Segments**.
2. Edit `Reservation guests`.
3. Click the **Reservation guests** restaurant shortcut, or set the rule manually to:
   `Customer tag` -> `has tag` -> `reservation-guest`.
4. Save the segment.
5. Confirm it matches `1` contact.
6. Download the CSV again; it should include `Abdi CRM Manual Guest`.

Latest CRM improvement pass before Scenario 8:

- Website and landing-page form submissions now create a first-class Inbox message when the customer chooses SMS or WhatsApp. It appears as a customer-side `Website form request` with submitted name, email, phone, date, time, party size, message, preferred channel, missing fields, and source context.
- Returning phone numbers that submit different name/email details now expose `Possible updated customer details` in CRM context instead of silently hiding the difference.
- The contact drawer now starts with a clearer action panel. Missing-detail reservations prioritize asking for details; confirmed reservations show a clean confirmed-state panel with date, time, party size, channel, and next actions.
- Older form submissions and technical event logs are collapsed by default so staff can focus on the latest request first.
- Inbox actions are now reservation-state-aware. Missing-detail threads show `Ask for missing details`; confirmed threads hide normal confirmation work and offer follow-up, cancel, reminder, and contact navigation actions.
- Inbox messages now label website requests, customer replies, staff replies, and automation messages more clearly.
- Inbox send/confirm/decline/cancel actions now refetch the thread, messages, notifications, and list data so the UI updates immediately.
- Notifications are grouped by related lead/contact/task/thread and show the newest actionable item first.
- Related notifications are marked handled when a reservation is confirmed/declined/cancelled, staff replies in Inbox, staff completes a task, or a deal is won/lost.
- The drawer keeps `Clear handled`, `Dismiss visible`, Close button, outside-click close, and Escape close behavior.
- Lead intent classification now detects callback language before reservation language, and also distinguishes quote/private dining requests more reliably.
- Inbound SMS detail extraction now understands replies such as `Tomorrow at 20:00 for 4 people`.
- Segments now make the difference clearer: lifecycle stages are generic CRM stages; `reservation-guest` is a tag. Restaurant-friendly shortcuts and helper copy remain the preferred path.

Verification for this pass:

- `pnpm.cmd --filter @marketing/shared typecheck` passed.
- `pnpm.cmd --filter @marketing/workers typecheck` passed.
- `pnpm.cmd --filter @marketing/web typecheck` passed.
- Focused `eslint --max-warnings 0` passed for all touched CRM, Inbox, notification, segment, SMS extraction, and form-submission files.

Browser verification still needed after deploy/restart:

- Submit one new reservation from the public page and confirm the first Inbox message is `Website form request`.
- Open the contact drawer and confirm the top panel is action-focused rather than event-log-heavy.
- Reply/confirm from Inbox and verify notifications disappear or move out of the active list.
- Recheck the `Reservation guests` segment export after using the tag-based rule.

Scenario 4 is completed. The latest confirmed Scenario 4 result is:

- Staff created a private/family dinner deal from the customer request.
- The deal value was `CHF 720`.
- Staff sent an SMS follow-up from Inbox.
- The customer received the SMS on `+41762147690`.
- The customer replied by SMS that the proposed offer works and asked the restaurant to reserve it.
- Staff moved/closed the deal as **Won**.
- The deal appears in the **Won** column.
- The pipeline forecast shows `Total open: CHF 0`, `Win rate: 100%`, and the Won column shows `CHF 720`.
- In Scenario 5, staff opened the Inbox thread and confirmed the customer acceptance message is visible:
  `Yes, that works for us. Please reserve it.`
- Inbox top counters show `Needs staff attention: 0`, so the conversation itself is not asking for staff action anymore.
- The notification drawer still shows old `Customer replied by SMS`, `New reservation request`, and `Reservation request needs details` alerts, even after related work was handled.
- A fix has now been implemented so staff can clear handled notifications in bulk, dismiss all visible notifications, and future staff replies / reservation final actions auto-dismiss related alerts.
- A fix has also been implemented so future staff reservation confirmation SMS sends update the Inbox message immediately as sent/delivered/failed instead of relying only on the background queue.
- Staff verified that `Clear handled` clears old notification noise.
- Staff verified that fresh notifications disappear automatically after staff handles the related work.

So Scenario 4 has reached:

```text
Customer request -> CRM contact -> deal created -> SMS follow-up sent -> customer accepted -> deal won
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

Status: completed.

Confirmed behavior:

- Staff created `Family dinner for 12 people - Abdi Restaurant`.
- The deal amount is `CHF 720`.
- The deal moved through the sales pipeline.
- Staff sent a private-dinner SMS follow-up from Inbox.
- Customer received the SMS.
- Staff moved the deal from `Inquiry` to `Qualified`.
- Staff sent the customer a concrete family dinner offer by SMS:
  `For 12 guests on 2026-07-12 at 20:00, we can offer a shared family menu from around CHF 60 per person...`
- Customer replied by SMS: `Yes, that works for us. Please reserve it.`
- The customer reply appeared in the Inbox and created an in-app notification.
- Staff marked the deal as `Won`.
- The deal appears in the `Won` column.
- The pipeline forecast shows `Total open: CHF 0`, `Win rate: 100%`, and the Won column carries the CHF 720 value.

Next step:

- Continue to Scenario 6: use Segments to create reusable customer lists.
- Create practical restaurant segments such as reservation guests, private dining leads, and SMS-preferred customers.
- Verify whether the Segments page is clear enough for non-technical restaurant staff.

### Scenario 5: Inbox Follow-Up And Daily Conversation Workflow

Status: completed.

Confirmed behavior:

- Staff opened the Inbox thread and saw customer/staff SMS messages in one place.
- Staff handled the latest customer reply.
- `Needs staff attention` returned to `0`.
- `Clear handled` cleared old notification noise.
- Fresh notifications now disappear automatically after staff handles the related work.

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
- The login form no longer makes a pre-login sign-out request, so sign-in is a single clean Better Auth call.
- The Better Auth route now logs thrown failures and returned 5xx responses so Vercel can show the real server-side cause of `POST /api/auth/sign-in/email 500`.
- Better Auth now avoids using a localhost base URL in production when the deployed app URL is available.

### Notification drawer behavior

Problem:

- The notification drawer showed a Refresh button but no obvious Close button.
- Clicking outside the drawer did not close it.

Outcome:

- The drawer now has a Close button.
- Clicking outside the drawer closes it.
- Pressing Escape closes it.

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
- The pipeline loader no longer hides the whole board when the forecast query fails.
- The server forecast query no longer passes an optional `undefined` condition into Drizzle `and()`.
- If the session expires on the Deals page, the page now shows a sign-in recovery message instead of only a generic pipeline error.

## Remaining Notes

These are the remaining follow-ups after the CRM improvement pass.

- Scenario documentation should include the actual screenshots from the user's walkthrough once each scenario is finished.
- Production must be redeployed before the user sees the latest Inbox, Contacts, Notifications, form-submission, and Segment improvements.
- After redeploy, complete a short browser regression for Scenarios 1-7 before starting Scenario 8.
- Consider a later dedicated CRM archive/history view if old activity events are still useful but too long for the daily staff drawer.

## Next Ordered Scenarios

1. Scenario 4: Private dining / quote request -> create a Deal.
2. Scenario 5: Inbox reply and follow-up -> show daily conversation workflow.
3. Scenario 6: Segments for reservation leads.
4. Scenario 7: Duplicates and returning customers.
5. Regression checkpoint: confirm the CRM improvement pass in browser after deploy/restart.
6. Scenario 8: Email or SMS sequence follow-up.

## Rule For The Assistant

At the start of every CRM walkthrough response, state:

```text
Current scenario:
Current step:
What the user has already confirmed:
Next action:
```

Do not jump to another scenario until the current one is explicitly finished.
