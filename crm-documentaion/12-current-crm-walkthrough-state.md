# Current CRM Walkthrough State

Last updated: 2026-07-02

This file prevents the CRM walkthrough from losing track while we test, fix, and document the restaurant workflows.

## Where We Are Now

We are in the manual CRM walkthrough for **Abdi Restaurant**.

The active scenario is:

```text
Forms module walkthrough
```

Current non-email walkthrough direction:

- CRM and SMS automation modules are finalized enough for now.
- Email settings, Email templates, and email Sequences are deferred because email automation is not finished yet.
- Continue with the **Forms** module next.
- Forms should be explained in plain English for non-technical restaurant staff:
  - what a form is
  - why the restaurant uses it
  - how staff creates/edits one
  - how it connects to landing pages/websites
  - how submissions become leads, contacts, CRM tasks, Inbox messages, notifications, consent records, and automation triggers
  - what practical scenarios a tenant might encounter

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
- Updated correction 2026-07-02: email automation is **not finished yet**, so do not continue the walkthrough through Email settings, Email templates, or email Sequences right now. Testing unfinished email automation will only land on expected errors. Return to email-related automation after the non-email walkthrough is complete and after the missing email automation functionality has been implemented.
- Walkthrough teaching rule: explain every page, feature, and scenario in plain English for non-technical tenant/staff users. The current tenant lens is a restaurant owner, so each step should explain the restaurant benefit, while still noting that the feature can apply to other business types.
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
- Production retest note: user confirmed the Segments part was already finalized and should not be repeated as the next walkthrough step unless a new regression appears.

Scenario 6 status:

- Completed for the walkthrough.
- Do not prompt the user to repeat Segments unless the user reports a fresh Segment issue or asks for a dedicated Segment regression.

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
- Regression retest started 2026-07-01: submitted a new production public-page reservation:
  - Name: `Regression Reservation Guest`
  - Email: `regression.reservation@example.test`
  - Phone: `+41762147690`
  - Date/time: `2026-07-08 19:00`
  - Party size: `2`
  - Preferred channel: `SMS`
  - Message: `Please reserve a table for two and confirm by SMS.`
- Regression result so far: Contacts shows a `Today` follow-up task `Confirm reservation request`; notification drawer shows `New reservation request`; Inbox shows the new `Website Form Request`; contact drawer top panel is action-focused and shows `Reservation - Awaiting Confirmation` with `Confirm reservation`, `Decline`, and `Mark contacted`.
- Regression UI/UX issue spotted: Inbox `Website Form Request` shows `Possible updated customer details` with `name: [object Object]` and `email: [object Object]`. This should render human-readable before/after values, not raw object strings.
- Next regression action: click `Confirm reservation` for the latest request and verify the customer receives the confirmation SMS, notification clears, and no failed-SMS warning returns.
- Regression confirmation result: staff clicked `Confirm reservation`. Contacts showed `Reservation confirmed. A customer confirmation SMS was sent and will appear in the Inbox timeline.` The right-side panel changed to `Reservation - Confirmed`, the follow-up queue became clear (`No open tasks`), and the latest open task was completed.
- Inbox regression result: the same thread shows status chips `Reservation` and `Confirmed`, the top action panel says `Reservation confirmed. Customer confirmation was sent by SMS.`, `Automation issues` stayed `0`, and the previous failed-SMS test remained only as historical failed-message state (`Failed messages: 1`).
- Follow-up verification still useful: confirm on the physical phone that the latest confirmation SMS arrived and contains the current regression reservation details (`2026-07-08`, `19:00`, `2 guests`). The visible Inbox timeline screenshot still shows older confirmation messages in the scrolled history, so inspect/scroll for the newest 2026-07-01 00:27 confirmation bubble if needed.
- Next pending regression action: verify notification cleanup after the confirmed reservation. Open the notification bell, use `Clear handled` if the old `New reservation request` alert is still visible, and confirm the bell badge disappears while the reservation remains confirmed.
- Notification cleanup regression passed: user reported that once the notification drawer was opened, the handled reservation notification was automatically removed from the drawer. This is acceptable and beginner-friendly because staff does not need to manually clear already-handled reservation work.
- Confirmation SMS content regression passed: user confirmed the phone SMS and the newest Inbox confirmation message both matched the latest regression reservation details (`2026-07-08`, `19:00`, `2 guests`).
- Broad production retest note: user reported that all previously tried CRM scenarios seem to be working. Treat the normal reservation, missing-details reservation, callback/follow-up, private dining deal, Inbox follow-up, SMS automation, and failed automation checks as healthy unless a later screenshot shows a regression.

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

### Scenario 6: Segments For Reservation Leads

Status: completed.

Confirmed behavior:

- Staff created and reviewed reservation-focused segments.
- The `reservation-guest` tag path was verified as the right restaurant-friendly rule.
- Segment fixes were implemented so restaurant shortcuts and tag-based rules are clearer than generic lifecycle-stage rules.
- User confirmed the Segments part was already finalized and should not be repeated unless a new Segment regression appears.

### Scenario 7: Duplicates And Returning Customers

Status: completed.

Confirmed behavior:

- Duplicate/similar CRM task completion was verified in production.
- Completing one matching task now completes duplicate matching tasks for the same customer, title, and workflow kind.
- The follow-up queue reloads after task completion so staff do not see old duplicate work as still open.
- User confirmed the Duplicates scenario is already taken care of and should not be repeated unless a new duplicate/customer-merge issue appears.

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
- Production Twilio is still in trial-mode constraints during the walkthrough: successful SMS send/receive tests use the verified phone `+41762147690`. Failed automation visibility should be tested with a separate CRM contact using an unverified/bad phone number so the app can surface send failure without risking the main walkthrough contact.
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
  - Live verification after redeploy/restart: staff re-enrolled `Abdi CRM Manual Guest` into `Manual reservation service follow-up` at about 14:54. The customer received the new SMS, and Inbox showed a new delivered automation bubble at 14:54.
  - Conclusion: the fresh-enrollment fix worked. Manual re-enrollment now creates and sends a new SMS instead of reusing the previous 08:19 enrollment/message.
  - Follow-up observation: SMS automation showed the latest message as `sent` at 14:54, while Inbox showed it as `delivered` a minute later. If SMS automation does not update to `delivered` after refresh, add a small refresh/status-sync improvement later; this is not blocking the send workflow.
  - Pause test verified: staff created `Manual pause test sequence` with two transactional steps: `Pause test first message` at 0 minutes and `Pause test second message` at 5 minutes. Staff enrolled `Abdi CRM Manual Guest`, received only the first SMS on the phone, saw the first automation message in Inbox, then paused the enrollment from Recent enrollments. The second SMS did not arrive. This confirms enrollment pause stops the future scheduled step.
- AI-assisted drafting notes:
  - AI-assisted sequence drafting should not auto-activate sends. Staff should review and activate manually.
  - Live AI draft test result: staff entered a two-step prompt for restaurant guests who asked for reservation details but did not reply. The page showed `AI is drafting the SMS automation...`, then failed with a raw validation error because the AI returned `trigger_event: "reservation_inquiry_no_reply"` instead of one of the product-supported trigger events.
  - Root cause found: the AI tool result allowed free-form `trigger_event` strings, while the dashboard apply step only accepted `lead.captured`, `reservation.status_changed`, or `manual`.
  - Fix implemented: SMS trigger normalization now maps known AI aliases such as `reservation_inquiry_no_reply` to supported product events before applying the draft. The AI tool schema and prompt now also explicitly constrain `trigger_event` to `lead.captured`, `reservation.status_changed`, or `manual`.
  - Safety behavior preserved: AI drafts still create paused sequences only. They must not enroll contacts, send SMS, or increase SMS usage until staff activates/enrolls.
  - Verification: shared SMS automation tests passed, including AI trigger alias normalization.
  - Verification: `@marketing/shared`, `@marketing/web`, `@marketing/workers`, and `@marketing/ai-router` typechecks passed.
  - Verification: focused `eslint --max-warnings 0` passed for the touched shared, web, worker, and AI-router files.
  - Live verification after GitHub push + automatic production deploy: staff reran the AI draft prompt. The page showed `AI draft created. Review it before activation.` A new sequence appeared: `Abdi Restaurant – Incomplete Booking Follow-Up`, trigger `lead.captured`, steps `30m: abdi_booking_missing_details_prompt -> 1440m: abdi_booking_gentle_followup`, status `Paused`. Monthly SMS stayed `33/50`, no customer SMS was sent, and Inbox did not receive a new automation message.
  - Conclusion: AI-assisted SMS drafting now works as intended in production. It creates a reviewable paused sequence only; staff must activate/enroll before any send can happen.
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
  - Verified: pausing an active enrollment stops the future scheduled SMS step.
  - Need to verify that manual enrollment respects consent, suppression, monthly limits, and duplicate enrollment protection.
  - Manual enrollment currently appears blocked because no manual sequence is available in the dropdown. Need to verify whether this is missing data, missing UI support, or trigger filtering that excludes the existing active restaurant presets.
  - Template creation should either block duplicate names per tenant or clearly distinguish duplicates in dropdowns.

## Scenario 9 Notes To Capture

Use this section during the failed automation visibility walkthrough.

- Failed SMS test contact created successfully from Contacts:
  - Name: `Failed SMS Test`
  - Email: `failed.sms.test@example.test`
  - Phone: `+41000000000`
  - Source: Manual
  - Contacts count increased to `2 contacts`
  - No SMS was sent just from creating the contact.
  - Purpose: use this contact for Twilio trial/unverified-number failure visibility without disturbing the main walkthrough contact at `+41762147690`.
- Failed automation visibility verified:
  - Staff enrolled `Failed SMS Test (+41000000000)` into `Manual reservation service follow-up` from SMS automation.
  - SMS automation initially showed a scheduled/success message: `Contact enrolled. First SMS step is scheduled for 6/30/2026, 5:42:39 PM`.
  - Inbox then showed `Open conversations: 2`, `Failed messages: 1`, and `Automation issues: 1`.
  - Inbox displayed a `Messaging automation attention` card with `Send Failed`, contact `Failed SMS Test`, and Twilio error `Twilio API error 400: Invalid 'To' Phone Number: +410000XXXX`.
  - The failed thread showed the outbound automation bubble in red with status `Failed` and the same Twilio error.
  - Conclusion: failed automation is visible in Inbox and does not pretend the SMS was delivered.
  - UI/UX improvement note: SMS automation Recent enrollments still showed `Completed` / `Latest SMS queued` for the failed enrollment at the time of the screenshot. Inbox correctly shows the failure, but SMS automation should refresh or derive the final message failure status so staff can trust either page without needing to open Inbox.
  - Clear attention verified: staff clicked `Clear` on the `Messaging automation attention` item. The page showed `Attention item cleared. 1 item removed from the attention list.`
  - After clearing, `Automation issues` changed to `0`, while `Failed messages` stayed `1` and the failed red conversation/message history remained visible. This is the correct behavior: clear the actionable alert, preserve the failed-message audit trail.

## Forms Module Walkthrough Notes To Capture

Use this section while teaching the Forms module after CRM/SMS automation.

- User wants to understand the Forms page/module in plain English, restaurant-minded, including why it exists, how to use it, practical scenarios, and how it connects to other modules.
- Current understanding from code/docs:
  - Forms are the lead-capture layer. They collect customer requests from public pages, embedded forms, or standalone form links.
  - Landing pages can own or embed forms. This is why the form detail page shows submissions from the public restaurant walkthrough.
  - Form submission creates a `lead`.
  - If the submission has email or phone, the app creates or updates a CRM `contact`.
  - The workflow classifier turns submissions into restaurant work such as reservation, missing details, callback, quote/private dining, or generic lead.
  - Submissions can create CRM tasks, staff notifications, staff SMS alerts, Inbox website-form messages, email/SMS consent records, and SMS automation trigger jobs.
  - Forms have active/inactive status, lead counts, edit controls, starter templates, form builder fields, anti-spam settings, analytics, submissions table, status updates, and CSV export.
- Teaching rule:
  - Explain a form as "the digital front-desk slip the guest fills out."
  - Explain landing page relationship as "the website displays the form; the Forms module stores, edits, tracks, and exports it."
  - Avoid email automation testing until the unfinished email functionality is implemented.
- Production screenshots 2026-07-02:
  - Forms list shows several forms with the same visible name `Abdi Restaurant - lead capture - Booking request`, but different slugs and submission counts (`12`, `4`, `3`, `0`, `0`). This is confusing for non-technical staff because they cannot quickly tell which form belongs to which landing page/version.
  - Forms list also shows `WhatsApp Inbox` as an inactive form with `9` submissions, which may confuse tenants because it sounds like an Inbox/system channel rather than a normal public form.
  - New form page is very sparse: it asks staff to "Describe your form" and says AI will build the "form schema". The word `schema` is too technical; restaurant staff need examples such as "table booking form", "private dining request", "catering quote", "callback request", and "newsletter signup".
  - Form detail page is powerful but dense: settings, submissions, starter templates, builder, preview, embed code, and analytics all appear on one long page. Non-technical tenants may not know what to touch first.
  - Technical labels such as `slug`, `field key`, `embed code`, `iframe embed`, `honeypot`, and `Turnstile` need plain-English helper copy.
  - The preview is useful because it shows what the guest sees, but the relationship between preview, public landing page, and CRM submission is not explained on-screen.
  - Analytics says unavailable/loading in the screenshot. If analytics is unavailable, the UI should explain whether there is no traffic yet, tracking is disabled, or analytics failed to load.
  - Submissions are useful and show booking/callback/quote badges and statuses, but the page should explain that changing the submission status here is administrative tracking and does not necessarily send a message to the customer.
  - The Forms module should clearly show linked landing page/public page URL so staff know where the form is being used.
  - Suggested improvement: add a beginner "What this form does" panel with a simple flow: Guest submits -> CRM contact/lead -> task/notification -> Inbox/SMS automation.
- Improvement implemented immediately:
  - English Forms copy no longer says AI creates a "form schema"; it says AI builds the questions.
  - English `Slug` wording changed to `Public link name` with a clearer URL explanation.
  - Anti-spam labels now explain the benefit in plain language instead of leading with `honeypot` / `Turnstile`.
  - `Embed code` wording changed to `Add this form to another website` / `Website embed code`.
  - New Form page now shows practical restaurant examples: table booking, private dining request, callback request, and newsletter signup.
  - Form detail page now has a `What this form does` panel explaining the flow: guest submits -> lead is saved -> CRM task appears -> staff follows up.
  - Form builder `Field key` label changed to `Internal field key` with helper text explaining staff usually edit the visible label instead.
  - Verification: `pnpm.cmd --filter @marketing/web typecheck` passed.
  - Verification: focused `eslint --max-warnings 0` passed for the changed Forms pages.
  - Production note: these UI improvements require GitHub push + production deployment before the tenant can see them on Vercel.
  - Live deployment: user reported the Forms UX improvements have been deployed to production on 2026-07-02.
- Form builder follow-up improvement implemented immediately:
  - Added a `Safe editing guide` to the Form builder so non-technical staff know they can safely edit labels/options, when to use `Required`, and why internal field keys should usually stay unchanged.
  - Changed `Conditional display` to `Only show this question sometimes` with a plain-English example.
  - Verification: `pnpm.cmd --filter @marketing/web typecheck` passed.
  - Verification: focused `eslint --max-warnings 0` passed for the changed Forms detail page.
  - Production note: this Form builder helper copy requires another GitHub push + production deployment before the tenant can see it on Vercel.
- Form builder collapsed-card improvement implemented immediately:
  - Form fields now show as compact summary cards by default so restaurant staff can scan the questions without seeing every advanced setting at once.
  - Each card shows the guest-facing label, field type, required/optional status, and whether it only appears sometimes.
  - Staff can click `Edit` to open the full powerful editor for that field, including label, type, internal field key, required setting, placeholder, number min/max, choices, conditional display logic, move, duplicate, and delete controls.
  - When staff adds a new question, the new field opens immediately so the next editing action is obvious.
  - This keeps the builder powerful for advanced tenants while making the first view less intimidating for non-technical staff.
  - Production note: this collapsed-card builder improvement requires GitHub push + production deployment before the tenant can see it on Vercel.
  - Live verification: user confirmed in production that clicking `Edit` opens the full field editor and clicking `Done` collapses the field back to the compact card.
- Forms analytics empty-state improvement implemented immediately:
  - Replaced the vague `Analytics unavailable` message with plain-English copy explaining that analytics appears after visitors open the public form and accept tracking consent.
  - Clarified that form submissions can still arrive even when analytics is empty.
  - Production note: this Analytics card improvement requires GitHub push + production deployment before the tenant can see it on Vercel.
  - Live deployment: user redeployed and confirmed the Analytics card looks better in production.
- Forms-to-Inbox submission verification:
  - Staff submitted a real table booking form using `Forms Walkthrough Guest`, `forms.walkthrough@example.test`, `+41762147690`, date `2026-07-10`, time `19:30`, party size `3`, preferred reply `SMS`, and message `Please book a table near the window if possible.`
  - Forms detail page showed the new submission as `New`.
  - Contacts showed a new reservation task and the contact drawer opened with `Reservation - Awaiting Confirmation`.
  - Inbox showed a new `Website Form Request` message with the submitted booking details and `Needs staff attention: 1`.
  - UI issue spotted: Inbox still rendered `Possible updated customer details` as `name: [object Object], email: [object Object]`.
  - Fix implemented: Inbox now formats these update hints as saved value -> submitted value so staff can understand what changed before editing the customer identity.
  - Production note: this Inbox formatting fix requires GitHub push + production deployment before the tenant can see it on Vercel.
  - Live deployment: user redeployed and confirmed the `[object Object]` formatting issue is fixed in production.
  - Reservation confirmation from Inbox passed: user confirmed that clicking `Confirm` for the Forms walkthrough reservation works. Treat the form submission -> Inbox -> reservation confirmation path as healthy.
- Shared-form quote/private dining verification:
  - Public generated website currently uses the same form for `Request quote` and `Reserve a table`.
  - Recommendation for the current walkthrough: test the shared form with quote/private dining wording to verify intent classification.
  - Staff submitted a private dining request with `Forms Private Dining Guest`, `forms.private.dining@example.test`, `+41762147690`, date `2026-07-18`, time `20:00`, party size `14`, preferred reply `SMS`, and message `We would like a private dining quote for 14 people with a shared menu and drinks package. Please send an offer.`
  - Result: Forms submissions classified it as `Quote`; submission drawer showed lead type `Quote`, workflow state `received`, and recommended action `Prepare quote reply`.
  - Contacts drawer showed `Quote - Received`, customer details were parsed, and CRM created a `Prepare quote reply` task.
  - Inbox showed the Website Form Request with `Quote`, `Received`, and `Landing_page_form` chips, and the submitted private dining details.
  - UI issue spotted: Inbox still showed reservation-style action buttons (`Confirm`, `Decline`, `Cancel`) on a quote thread, which is confusing because a quote should not be confirmed like a table reservation.
  - Fix implemented: Inbox action buttons are now workflow-aware. Booking threads keep reservation actions; quote threads show `Mark contacted`, `Prepare quote reply`, and `Open contact` instead.
  - Live deployment: user redeployed and confirmed the quote Inbox thread now shows `Prepare quote reply` and no misleading reservation confirmation buttons.
  - Next pending walkthrough action: test `Prepare quote reply` on the quote Inbox thread. The button should only fill the SMS reply draft, not send automatically. Staff should review/edit the draft, click `Send`, confirm the SMS appears in the Inbox timeline, confirm the customer phone receives it, then optionally click `Mark contacted` to clear the staff-attention work.
  - Live verification: user confirmed the quote reply flow behaved as expected. `Prepare quote reply` filled a draft instead of sending automatically, the staff could send the SMS from Inbox, the customer received it, and the follow-up state behaved as expected after staff handling.
  - Follow-up confirmation: user again confirmed the latest quote/private dining flow works as expected in production.
  - Correction: do not drift back into a full CRM walkthrough. CRM, Inbox, SMS automation, Segments, and Duplicates have already been explored and verified. When Forms links to CRM actions, explain them only as Forms interconnections: what a form submission creates, where it can send staff next, and why that matters from the Forms page.
  - Next Forms walkthrough area: stay on the Forms detail page and teach Forms-owned behavior: submissions list, submission drawer, status tracking, export, starter templates, form builder, preview, embed/public usage, analytics, active/inactive state, and how one form can feed different workflows such as reservation vs quote.
  - Forms submission status tracking verified: user changed a submission status and confirmed it behaved as expected. The Forms status filters/list update correctly, and the status behaves as administrative tracking rather than sending a customer message.
  - Forms CSV export verification:
    - User exported `abdi-restaurant-98c1aff3-lead-98c1aff3-submissions.csv`.
    - The export downloaded and included recent submissions such as `Forms Private Dining Guest` and `Forms Walkthrough Guest`.
    - Issue found: the CSV used technical columns (`submitted_at`, `source_url`, `contact_id`, raw JSON `payload`) that are not beginner-friendly for a restaurant owner.
    - Improvement implemented immediately: Forms CSV export now uses plain-English columns such as `Submitted at`, `Form status`, `Request type`, `Workflow state`, `Recommended staff action`, `Name`, `Email`, `Phone`, `Preferred reply`, `Requested date`, `Requested time`, `Guests`, `Message`, `Source page`, and `Other answers`.
    - Internal IDs and raw JSON payloads were removed from the default tenant-facing export. Unusual custom fields are flattened into `Other answers`.
    - Verification: `pnpm.cmd exec prettier --write apps/web/src/server/trpc/routers/forms.ts`, focused `eslint --max-warnings 0`, and `pnpm.cmd --filter @marketing/web typecheck` passed.
    - Production note: this cleaner CSV export requires GitHub push + production deployment before Vercel downloads show the new columns.
    - Live deployment: user confirmed the cleaner CSV export is better in production.
  - Starter templates review:
    - Current behavior: clicking a starter template replaces the editor questions and submit button label, but the live public form does not change until staff clicks `Save form`.
    - Beginner-risk found: a non-technical tenant could click a template while exploring and not realize the current working booking questions were replaced in the editor.
    - Improvement implemented immediately: starter template clicks now ask for confirmation before replacing the editor questions. Helper copy also explains that the live form changes only after `Save form`.
    - Verification: `pnpm.cmd exec prettier --write apps/web/src/app/[locale]/(dashboard)/forms/[id]/page.tsx`, focused `eslint --max-warnings 0`, and `pnpm.cmd --filter @marketing/web typecheck` passed.
    - Production note: this template confirmation improvement requires GitHub push + production deployment before Vercel shows it.
    - User feedback after deployment: the browser-native alert worked but did not feel professional.
    - Refinement implemented immediately: replaced the browser alert with an in-app confirmation dialog using the shared dashboard modal. The dialog explains that applying a starter template replaces editor questions only and that the public form changes only after `Save form`.
    - Verification: focused `prettier`, `eslint --max-warnings 0`, and `pnpm.cmd --filter @marketing/web typecheck` passed.
    - Production note: redeploy before retesting the polished starter-template dialog in production.
  - Form rollback/history improvement:
    - User correctly identified that after a tenant replaces a form and publishes it, they need a way to return to the previous working form.
    - Product decision: this is necessary beginner-friendly safety for non-technical tenants. A tenant should be able to explore templates and publish changes without feeling one mistake permanently damaged the website form.
    - Improvement implemented immediately: added tenant-scoped `form_versions` persistence. Before each saved form update, the current saved configuration is snapshotted.
    - Forms detail page now includes a compact `Form history` panel. Staff can restore a previous saved version into the editor, inspect the Preview, and then click `Save form` only if they want to publish the restored version.
    - This keeps rollback deliberate: restore does not silently change the public form until staff saves.
    - Files changed include `packages/db/src/schema/landing-pages.ts`, `packages/db/migrations/0047_form_versions.sql`, `apps/web/src/server/trpc/routers/forms.ts`, and `apps/web/src/app/[locale]/(dashboard)/forms/[id]/page.tsx`.
    - Verification: focused `prettier`, focused `eslint --max-warnings 0`, `pnpm.cmd --filter @marketing/db typecheck`, `pnpm.cmd --filter @marketing/web typecheck`, and `pnpm.cmd --filter @marketing/db test` passed.
    - Production note: this requires both code deployment and the new database migration before `Form history` works in production.
    - Production migration applied from this workspace using `pnpm.cmd --filter @marketing/db db:apply 0047_form_versions.sql`. PostgreSQL reported the expected harmless notice that the policy did not exist before creation, then applied `0047_form_versions.sql` successfully.
  - Starter template content quality review:
    - User reviewed the generated `Quote request` preview before saving and asked whether it is good enough.
    - Assessment: the structure was useful, but the content was too generic for the restaurant walkthrough. `Project details`, `Consultation`, and `Support` were not clear enough for private dining or restaurant quote requests.
    - Improvement implemented immediately: updated the `Quote request` starter template to be more restaurant-friendly while still usable for other businesses. It now says it is good for private dining, catering, events, consultations, and custom offers; uses `Request details`; asks `What kind of quote do you need?`; includes options for private dining/group booking, catering/package, event menu, and custom quote; and collects optional preferred date, preferred time, number of people, and a clearer needs/message field.
    - Verification: focused `prettier`, `eslint --max-warnings 0`, and `pnpm.cmd --filter @marketing/web typecheck` passed.
    - Production note: redeploy before the improved quote starter template appears in production.
  - Product recommendation: generated restaurant pages should eventually use either a shared form with an explicit `Request type` field or separate forms/sections for `Reserve a table` and `Request quote`.
  - Production note: the quote-specific Inbox action fix requires GitHub push + production deployment before the tenant can see it on Vercel.

## Next Ordered Scenarios

1. Continue the walkthrough with the next non-email application area/page. Email settings, Email templates, and email Sequences are deferred until email automation functionality is implemented.
2. Later checkpoint: return to email automation after implementation, then test Email settings -> Email templates -> email Sequences in plain restaurant-owner language.
3. Later checkpoint: retest Scenarios 1-7 in browser only if a new regression appears or after a broader release changes CRM behavior.

## Rule For The Assistant

At the start of every CRM walkthrough response, state:

```text
Current scenario:
Current step:
What the user has already confirmed:
Next action:
```

Do not jump to another scenario until the current one is explicitly finished.

For every next walkthrough action, guide the user like an operator runbook, not a summary. Include:

- Purpose: why this tenant/staff scenario matters and what product capability it demonstrates.
- Page to open: exact sidebar item or route, for example `SMS automation`, `Inbox`, `Contacts`, `Segments`, or `Deals`.
- Exact controls: which dropdown, form, field, checkbox, tab, or button to use.
- Data to enter: concrete names, phone numbers, message text, dates, amounts, tags, or selections when the step requires input.
- What to submit/click: the final button or action, with the visible label.
- Expected result: what should happen on-screen, what the customer should receive, what counts should change, and what Inbox/CRM state should appear.
- What to watch for: common confusion, consent/quiet-hours/monthly-limit behavior, stale status, or expected delays.
- Pass/fail checkpoint: what the user should report back before moving to the next step.

The purpose of this walkthrough is to teach and verify every relevant tenant-facing CRM/SMS/email automation feature across realistic scenarios. Never assume the user already knows which page, button, or form to use.

Production walkthrough rule:

- The user verifies the walkthrough in production, not only locally.
- If Codex changes core code that affects production behavior, clearly tell the user that the code must be pushed to GitHub and deployed before the browser retest can reflect the fix.
- When the user reports that they pushed and production auto-deployed, record the live verification result in this file.
- Keep taking UI/UX and beginner-friendliness notes during the walkthrough. Save practical improvements, confusing wording, missing explanations, and logic gaps in this file even when they are not blocking.
- Before choosing the next scenario step, cross-check [11-manual-crm-scenario-playbook.md](11-manual-crm-scenario-playbook.md) so the walkthrough does not skip planned tenant scenarios such as failed automation visibility.
