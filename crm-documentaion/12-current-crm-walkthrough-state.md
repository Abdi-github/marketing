# Current CRM Walkthrough State

Last updated: 2026-06-30

This file prevents the CRM walkthrough from losing track while we test, fix, and document the restaurant workflows.

## Where We Are Now

We are in the manual CRM walkthrough for **Abdi Restaurant**.

The active scenario is:

```text
Scenario 8: Email/SMS sequence follow-up
```

Scenario 8 working rule:

- Continue the walkthrough now with Email/SMS sequence follow-up.
- For each Scenario 8 step, record practical notes in this file:
  - what worked
  - what confused the tenant/staff experience
  - what UI copy should be improved
  - what logic or automation should be fixed
  - whether the issue is blocking or can wait
- After the full application walkthrough is complete, come back and run a browser retest of Scenarios 1-7 to confirm the new CRM UX still behaves correctly after the latest UI changes.

Latest Scenario 8 checkpoint:

- Staff opened **Sequences** and saw the email sequence dashboard.
- The page shows `Email sender not ready`, because email automation still depends on finalizing sender/domain configuration after Resend domain verification.
- Decision: continue Scenario 8 through **SMS automation** first, because the application is multi-channel and SMS is already working in the restaurant walkthrough.
- Email automation remains in scope, but it will be finalized after the broader application walkthrough and after the verified sender setup is wired into the product experience.
- Staff opened **SMS automation**.
- SMS automation is available on the Starter plan with visible usage: `30/50` monthly SMS used and `20` remaining.
- The verified business phone is visible: `+41762147690`.
- Restaurant SMS presets are already installed and active:
  - `Reservation details recovery`
  - `Confirmed reservation follow-up`
- The screen supports:
  - creating SMS templates
  - drafting with AI
  - building a manual sequence
  - pausing active sequences
  - manually enrolling a phone contact
  - viewing recent enrollments
- Staff opened manual enrollment dropdowns:
  - `Choose manual sequence` only showed the placeholder and no usable sequence.
  - `Choose phone contact` showed `Abdi CRM Manual Guest (+41762147690)`.
- Conclusion: contact selection works, but manual enrollment is not usable until there is a manual/enrollable sequence. The UI should explain this or provide a shortcut to create one.
- Staff created an SMS template named `Post-visit thank you`.
- The `Choose template` dropdown now shows two `Post-visit thank you` options, plus `Missing reservation details`, `Reservation confirmed`, and `Reservation reminder`.
- Conclusion: template creation works, but duplicate template names are not distinguished. The UI should prevent duplicate names or show creation date/status/purpose so staff can pick the right one.
- Fix implemented: SMS template dropdown labels now include category and source, for example preset/custom, so duplicate names are easier to distinguish.
- Staff created and activated a manual sequence named `Manual post-visit thank you`.
- Staff enrolled `Abdi CRM Manual Guest (+41762147690)` and saw `Contact enrollment queued`.
- Important observation: the Inbox messages visible after enrollment were old reservation/automation messages. The expected post-visit message beginning `Abdi Restaurant: Thank you for visiting us...` was not present.
- Fix implemented: manual SMS enrollment now creates or restarts a real due enrollment, requires an active manual sequence, wakes the SMS sequence worker, and returns a clearer scheduled first-step message.
- Safety behavior: if the selected manual sequence contains marketing SMS steps, enrollment is blocked unless the contact has explicit SMS marketing opt-in. The UI should explain this instead of silently showing a queued state.
- Verification: `pnpm.cmd --filter @marketing/web typecheck` passed after the manual SMS enrollment fix.
- The walkthrough should explain sequence concepts in plain restaurant-owner language: who receives the messages, when they are sent, what consent is needed, and what staff should review before activation.

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

Post-walkthrough browser regression checkpoint:

- After the broader application walkthrough is complete, retest Scenarios 1-7 in the browser to confirm the new CRM UX behaves correctly after the latest UI modification.
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
- After the full walkthrough, complete a browser regression for Scenarios 1-7 so the new Contacts, Inbox, Notifications, Deals, Segments, and Duplicates UX is confirmed in the real tenant flow.
- Consider a later dedicated CRM archive/history view if old activity events are still useful but too long for the daily staff drawer.

## Scenario 8 Notes To Capture

Use this section during the Email/SMS sequence walkthrough.

- Sequence setup notes:
  - The current `Sequences` page is email-first. For a multi-channel SaaS, this may confuse tenants who want SMS-first automation.
  - Need to verify whether SMS sequences live only under `SMS automation` or whether the main `Sequences` page should become multi-channel.
  - SMS automation screen already has the core objects needed for restaurant follow-up: templates, sequences, AI draft, manual enrollment, active presets, and enrollment history.
  - Recent enrollments show `Completed`, but the displayed `next run` timestamps are in the past. This wording is confusing; completed enrollments should say `Completed on ...` or hide `next run`.
- Template/preset notes:
  - Email template/preset review is deferred until email sender setup is finalized.
  - SMS presets should be reviewed first for restaurant use cases such as reservation confirmation, reminder, missing details, and post-visit follow-up.
  - Restaurant presets appear installed already. Need to verify what templates they created and whether the wording is appropriate.
  - Duplicate template names are possible or visible. `Post-visit thank you` appeared twice after saving, likely because a preset template already existed.
- Consent and opt-out notes:
  - SMS marketing/nurture sequences should require explicit SMS consent.
  - Transactional reservation follow-up can be allowed for the active customer request, but opt-out behavior must remain visible and reliable.
- Manual enrollment notes:
  - Phone contact selection works; `Abdi CRM Manual Guest (+41762147690)` appears.
  - Manual sequence selection is empty. This is confusing because the page shows active sequences above, but none are available for manual enrollment.
  - Improvement needed: show only manually enrollable sequences, explain why automatic trigger sequences cannot be manually selected, or add a `Create manual sequence` shortcut.
  - Manual sequence creation supports `Manual enrollment` as a trigger, so the empty manual enrollment dropdown is likely because no manual sequence had been saved yet.
  - The sequence-level intent dropdown offers `Reservation`, `Callback`, `Quote`, and `General inquiry`.
  - The step-level purpose dropdown offers `Marketing (consent required)` for post-visit follow-up, which is the correct safety model for nurture messages.
  - A paused manual sequence named `Manual post-visit thank you` was created successfully and appears in the manual enrollment dropdown.
  - Manual enrollment correctly requires choosing both a manual sequence and a phone contact before enrollment.
  - The sequence remains paused after saving, so enrollment should not be tested until activation/consent behavior is understood.
  - After activation, `Manual post-visit thank you` changed to Active and the `Enroll contact` button became enabled.
  - Clicking `Enroll contact` showed `Contact enrollment queued`, but no SMS arrived immediately and the recent enrollments area did not visibly add the new manual enrollment without further checking.
  - The Inbox messages visible after enrollment were old messages. The new post-visit thank-you SMS was not present.
  - Fix implemented: manual enrollment now validates active/manual sequence state, checks marketing SMS consent, creates or restarts the enrollment, and triggers the sequence tick worker immediately.
  - Expected after redeploy/restart: enrollment should either show a clear marketing-consent blocker or schedule the first step and produce a new Inbox/SMS message when the worker runs.
  - Live result after redeploy: enrolling `Abdi CRM Manual Guest` into `Manual post-visit thank you` now shows:
    `This sequence includes marketing SMS. The contact must opt in to SMS marketing before enrollment.`
  - Conclusion: this is correct production safety behavior, not a broken send. A customer choosing SMS for one reservation means staff may contact them about that request; it does not automatically mean they agreed to marketing or post-visit nurture SMS.
  - Next walkthrough choice:
    - To test marketing SMS correctly, the customer must explicitly opt in to SMS marketing first.
    - To test a request-specific operational follow-up now, create a transactional manual sequence instead of a marketing post-visit sequence.
  - Improvement needed: the SMS automation UI should make the opt-in path obvious by showing each contact's SMS marketing consent status and by explaining how consent can be collected from public forms or a customer `START` reply.
  - Improvement needed: generated forms should include a clear optional SMS marketing consent checkbox when a tenant wants to use marketing SMS sequences.
  - Improvement needed: after manual enrollment, the page should show a clear queued/scheduled row with sequence name, contact, next run time, send status, and a refresh/check status action.
  - After refreshing, the SMS automation page still did not show a `Manual post-visit thank you` row under Recent enrollments, and monthly usage stayed at `30/50`.
  - The Inbox thread did show automation messages, including queued automation bubbles and at least one delivered automation bubble, so the staff-facing status is split across pages.
  - Improvement needed: SMS automation, Inbox, and Integrations should show the same send/enrollment status so staff can trust whether a sequence actually sent.
  - Fix implemented: SMS automation overview now attaches each recent enrollment's latest related SMS message from Inbox metadata, and the Recent enrollments UI shows `Latest SMS queued/sent/delivered/failed ...` or the failure reason.
  - Verification: `pnpm.cmd --filter @marketing/web typecheck` passed.
  - Verification: focused `eslint --max-warnings 0` passed for the SMS automation router and page.
  - Live retest result at 2026-06-30 14:18: staff enrolled `Abdi CRM Manual Guest` into `Manual reservation service follow-up`. The page showed `Contact enrolled. First SMS step is scheduled for 6/30/2026, 2:18:10 PM`, and the enrollment completed at 14:18, but no new customer SMS arrived and Inbox still showed the previous 08:19 delivered automation message.
  - Root cause found: manual re-enrollment reused the existing `(sequence_id, contact_id)` enrollment row. The SMS sequence worker then tried to create step `0` again for the same `enrollmentId`, but the existing message uniqueness guard on `(meta->>'enrollmentId', meta->>'stepIndex')` treated the old 08:19 SMS as the same step. The enrollment advanced/completed without creating a new Inbox message or sending a new SMS.
  - Fix implemented: manual re-enrollment now creates a fresh enrollment run by replacing the old enrollment row before inserting the new due enrollment. Old Inbox messages remain as conversation history, but the new run gets a new `enrollmentId`, so step `0` can create and send a fresh SMS.
  - Verification: `pnpm.cmd --filter @marketing/web typecheck` passed after the fresh-enrollment fix.
  - Verification: focused `eslint --max-warnings 0` passed for the SMS automation router after the fresh-enrollment fix.
  - Next walkthrough action: redeploy/restart, enroll `Abdi CRM Manual Guest` into `Manual reservation service follow-up` again, and confirm a new Inbox automation bubble appears with the current time and a new customer SMS is received.
- AI-assisted drafting notes:
  - AI-assisted sequence drafting should not auto-activate sends. Staff should review and activate manually.
- Sending/delivery/status notes:
  - SMS delivery status should be checked in Inbox/SMS automation before judging a sequence successful.
- UI or wording improvements:
  - The email sequence dashboard should say clearly that email is unavailable until sender setup is complete, but SMS automation can still be used from the SMS automation area.
  - Consider renaming the sidebar item from `Sequences` to `Email sequences` or creating a unified `Automations` page with Email and SMS tabs.
  - SMS automation should explain the difference between transactional messages and marketing messages in more ordinary language.
  - Manual enrollment should explain which contacts are eligible and why some contacts may not appear in the phone contact dropdown.
  - The `Install restaurant presets` button still appears even though presets are already installed. It should become `Restaurant presets installed`, `Reinstall presets`, or hide after install.
  - Template dropdowns should show more context than name only, for example `Post-visit thank you - custom` vs `Post-visit thank you - preset`.
- Logic/functionality fixes:
  - Need to verify whether SMS sequence creation, activation, enrollment, pausing, and delivery tracking are all available from the tenant UI.
  - Need to verify that pausing a sequence stops future scheduled sends.
  - Need to verify that manual enrollment respects consent, suppression, monthly limits, and duplicate enrollment protection.
  - Manual enrollment currently appears blocked because no manual sequence is available in the dropdown. Need to verify whether this is missing data, missing UI support, or trigger filtering that excludes the existing active restaurant presets.
  - Template creation should either block duplicate names per tenant or clearly distinguish duplicates in dropdowns.

## Next Ordered Scenarios

1. Scenario 4: Private dining / quote request -> create a Deal.
2. Scenario 5: Inbox reply and follow-up -> show daily conversation workflow.
3. Scenario 6: Segments for reservation leads.
4. Scenario 7: Duplicates and returning customers.
5. Scenario 8: Email or SMS sequence follow-up.
6. Later checkpoint: retest Scenarios 1-7 in browser after the broader walkthrough and latest UI modifications.

## Rule For The Assistant

At the start of every CRM walkthrough response, state:

```text
Current scenario:
Current step:
What the user has already confirmed:
Next action:
```

Do not jump to another scenario until the current one is explicitly finished.
