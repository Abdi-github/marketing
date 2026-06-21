# WhatsApp automation workflow

This document explains the WhatsApp automation flow that is implemented in the app today, how it behaves for a restaurant tenant, what was verified in the browser, what inputs are involved, and what still depends on Meta credentials.

## Purpose

The goal of this workflow is to turn inbound WhatsApp messages into structured CRM activity for a tenant business.

For a restaurant tenant, the intended flow is:

1. A customer sends a WhatsApp reservation request.
2. The app receives the webhook.
3. The message is normalized and classified.
4. A contact is created or updated in CRM.
5. A lead is created.
6. A reservation follow-up task is created for staff.
7. A branded acknowledgment reply is attempted.
8. The full message history is visible in the tenant inbox.

The product behavior is intentionally concierge-style, not autonomous booking confirmation. A reservation request is treated as received and waiting for staff confirmation.

## Current local verification result

Verified on `localhost:3000` on June 21, 2026.

What worked:

- inbound webhook receipt
- WhatsApp message parsing
- restaurant reservation intent classification
- reservation fact extraction
- CRM contact creation/update
- lead creation
- follow-up task creation
- inbox timeline display
- automation issue visibility
- tenant-side manual WhatsApp reply
- automated restaurant acknowledgment reply

Final known-good result from this run:

- inbound message from allowed recipient `+41762147690` was accepted
- CRM thread was created for the restaurant tenant
- reservation lead was stored with `workflowKind = booking`
- manual reply from inbox returned a real Meta `messageId`
- automated acknowledgment also returned a real Meta `messageId`

Important clarification:

- earlier failures in this same session were real, but they came from stale local process state
- the web app was first missing the WhatsApp test env in `apps/web/.env.local`
- several duplicate worker processes were still running with an old expired token
- one replay used an old inbound timestamp, so the app correctly treated it as outside the 24-hour service window
- one earlier thread used a recipient number not on Meta's allowed-list for the test number

After syncing the web env and restarting the workers cleanly, the local restaurant WhatsApp automation flow worked end to end.

## Restaurant scenario used for verification

Tenant:

- business type: restaurant
- business name: `Abdi Restaurant`

Customer inbound message used for testing:

```text
Hello, I would like to reserve a table for 4 tomorrow at 19:30 under Jean Dupont.
```

Expected extracted facts:

- customer name: `Jean Dupont`
- party size: `4`
- reservation date: `tomorrow` resolved into a concrete date
- reservation time: `19:30`
- channel: `whatsapp`
- workflow kind: `booking`
- workflow state: `missing_details` or `awaiting_confirmation` depending on extracted completeness

## Required inputs and configuration

### Environment inputs

The workflow depends on these WhatsApp-related environment values:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEST_MODE_ENABLED`
- `WHATSAPP_TEST_TENANT_SLUG`

For local test-mode verification, the app was set to target the restaurant tenant slug:

- `geneva-restaurant-e2e-jz3bc`

### Tenant/business data inputs

The tenant side influences the workflow through:

- business profile locale
- business vertical
- lead capture settings
- channel preference
- confirmation wording settings

### Customer message inputs

Inbound messages may include:

- plain text
- button replies
- interactive replies
- location
- document or image metadata
- contact card metadata

## End-to-end process

## 1. Webhook arrival

Route:

- `/api/webhooks/whatsapp`

Behavior:

- verifies Meta webhook signature when `META_APP_SECRET` is configured
- parses the webhook payload
- extracts the `phone_number_id`
- maps the event to the correct tenant
- enqueues an inbound WhatsApp processing job

## 2. Inbound message normalization

The system normalizes inbound payloads into a shared WhatsApp shape.

Supported message categories include:

- `text`
- `button`
- `interactive`
- `image`
- `document`
- `audio`
- `location`
- `contacts`
- `unknown`

The normalized message includes:

- message id
- sender phone
- phone number id
- timestamp
- preview text
- structured metadata

## 3. Intent classification

The worker classifies the inbound request into a business intent.

Current intent families:

- reservation
- appointment
- quote
- callback
- generic inquiry
- manual review

For the restaurant verification scenario, the system classified the message as:

- WhatsApp intent: `reservation`
- workflow kind: `booking`

## 4. Fact extraction

The worker extracts structured facts from the inbound content.

Examples of extracted fields:

- `customerName`
- `phone`
- `email`
- `reservationDate`
- `reservationTime`
- `partySize`
- `locationLabel`
- attachment metadata

In the verified restaurant scenario, the inbox showed extracted facts for:

- Customer: `Jean Dupont`
- Date: resolved next-day date
- Time: `19:30`
- Attachments: `0`

## 5. CRM contact handling

The system then:

1. looks up an existing contact by phone number
2. creates a contact if none exists
3. updates missing profile data when available
4. promotes a contact from `subscriber` to `lead` when appropriate

This ensures inbound WhatsApp activity lands in the tenant CRM rather than staying only in channel logs.

## 6. Lead creation

A lead record is created with WhatsApp-specific metadata.

Lead attributes include:

- source channel: `whatsapp`
- workflow kind
- workflow state
- structured extracted facts
- timestamp of latest automation attempt

For restaurant reservations, the lead is meant to move through a reservation-oriented path such as:

- `new`
- `contacted`
- `confirmed`

The current implementation already writes the reservation-related workflow metadata that will support that path.

## 7. Task creation for staff

When the inbound message is actionable, the worker creates a CRM task.

Restaurant reservation example:

- task title similar to `Confirm restaurant reservation`

The task is intended to make sure staff can act on real customer requests without relying only on automated messaging.

## 8. Attempted acknowledgment reply

After the lead is stored, the worker attempts to send a branded reply.

Example intended acknowledgment:

```text
Thanks for your request for Abdi Restaurant. We will confirm your booking shortly.
```

This reply is only sent when:

- WhatsApp credentials resolve successfully
- the conversation is still inside the 24-hour service window

If sending fails, the failure is recorded in the thread and surfaced in the inbox.

Important delivery note:

- the app can mark a message as accepted by Meta before the final delivery webhook arrives
- real delivery state is updated later from Meta status events such as `sent`, `delivered`, `read`, or `failed`
- for debugging, always distinguish:
  - accepted by Meta
  - delivered to the phone
  - read by the recipient

## 9. Inbox visibility

Verified page:

- `/en/crm/inbox`

The inbox currently shows:

- WhatsApp thread list
- contact identity
- workflow kind badge
- workflow state badge
- extracted reservation facts
- message timeline
- automation issue banner
- failed outbound message details

In the verified run, the browser showed:

- latest inbound reservation thread
- `reservation` badge
- `missing details` badge
- the extracted customer and time facts
- earlier failed acknowledgment attempts
- later successful manual and automated outbound replies after env/process correction

## Browser verification steps performed

The following was verified in the browser and supporting local calls:

1. Opened `http://localhost:3000/en/login`
2. Logged in as restaurant tenant user
3. Confirmed dashboard loaded for `Abdi Restaurant`
4. Replayed a signed WhatsApp webhook request into `/api/webhooks/whatsapp`
5. Opened `/en/crm/inbox`
6. Confirmed a new WhatsApp thread appeared
7. Confirmed the automation attention panel showed reservation follow-up items
8. Opened the latest thread
9. Confirmed extracted reservation facts were visible
10. Confirmed failed outbound attempts were stored and visible in the conversation

## What the browser proved

The browser verification proved that these application parts are functioning together:

- webhook ingestion
- queue handoff
- worker processing
- CRM write path
- inbox rendering
- issue reporting

The browser also proved that the previous break was not hidden. It was visible and traceable in the product UI while we were fixing it.

## Current blocker

There is no local architecture blocker in the verified test-mode flow anymore.

The current operational risk is env/process consistency:

- `apps/web` and `apps/workers` must both use the same current WhatsApp token and phone number id
- after token rotation, both the web app and the workers must be restarted
- test-mode delivery still depends on Meta recipient allow-list rules and the 24-hour service window

## Meta test-number validation checklist

You do not need a real business WhatsApp number for this validation step.

You can validate the current MVP flow with the Meta test number, as long as the Meta app, token, phone number ID, and test-recipient setup all belong to the same working test configuration.

Use this checklist inside the Meta dashboard.

### 1. Confirm you are using the same Meta app

In Meta Developers, open the same app that you used when you generated:

- the current temporary `WHATSAPP_ACCESS_TOKEN`
- the test WhatsApp number
- the webhook configuration

If you generated the token in one Meta app but copied the phone number ID from another Meta app, outbound send will fail even if inbound webhook verification appears correct.

### 2. Confirm the WhatsApp product is attached to that app

Inside the same Meta app:

1. Open the WhatsApp product.
2. Open the test or API setup screen.
3. Confirm the app shows an active test number.

The phone number ID shown there must match the one configured locally.

Current local value to compare:

- `WHATSAPP_PHONE_NUMBER_ID=1128314047036398`

If Meta shows a different phone number ID, update the local env to the Meta value for that exact test number.

### 3. Confirm the token belongs to the same test setup

Regenerate the temporary token from the same WhatsApp test-number setup screen and replace:

- `WHATSAPP_ACCESS_TOKEN`

Important:

- temporary tokens expire
- generating a new token in a different Meta context can silently mismatch the active phone number ID
- a copied token may look valid but still fail on send with Meta code `190`

If you regenerate the token, restart the local app and workers after replacing it.

### 4. Confirm the app has the expected WhatsApp access

In the test-number setup, confirm the token is intended for WhatsApp Cloud API sending from that app.

At a practical level, the token should be the one Meta gives you from the WhatsApp API setup flow, not a random app token from a different Meta surface.

For MVP verification, the simplest rule is:

- only use the token generated on the same WhatsApp setup screen where the test phone number is shown

### 5. Confirm the recipient phone is allowed in test mode

Meta test numbers only send to approved recipients.

In the Meta WhatsApp test setup:

1. Find the allowed recipient list.
2. Confirm your test recipient phone is added and verified.
3. Confirm you are sending to that same phone in the app.

Current test message flow used:

- inbound from `+41791234567`

If that number is not an approved test recipient in Meta, outbound send can fail even when the local app is correct.

### 6. Confirm webhook and send belong to the same phone setup

The following items must all belong to the same logical WhatsApp setup:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`

In other words:

- webhook verification can succeed with one app secret
- inbound can still reach your app
- but outbound can fail if the send token and phone number ID are not from the same active WhatsApp test setup

### 7. Confirm the test number can send from Meta's own test panel

Before blaming the app, validate directly in Meta:

1. Open the WhatsApp test-number panel.
2. Use Meta’s built-in send-message test.
3. Send to the same approved recipient.

Interpretation:

- if Meta’s own test send fails, the problem is definitely in Meta setup, not in this app
- if Meta’s own test send succeeds but this app still fails with code `190`, the local token or phone number ID copy is not the same one Meta is actively using

### 8. Compare local config values

Current local configuration that should be matched against Meta:

- `META_APP_SECRET` is present
- `WHATSAPP_PHONE_NUMBER_ID=1128314047036398`
- `WHATSAPP_ACCESS_TOKEN` is present
- `WHATSAPP_VERIFY_TOKEN=whatsapp-verification-token-for-marketing-saas`

The most important comparison is:

1. open the WhatsApp test-number setup in Meta
2. read the exact test phone number ID shown there
3. confirm it equals `1128314047036398`
4. generate a fresh token from that same screen
5. replace the local `WHATSAPP_ACCESS_TOKEN`

### 9. What success should look like after correction

Once the Meta pairing is correct, the restaurant test should behave like this:

1. inbound reservation message reaches `/api/webhooks/whatsapp`
2. inbox thread appears
3. CRM lead is created
4. reservation task is created
5. automated acknowledgment is sent successfully
6. inbox thread shows outbound message status as `sent`
7. later Meta status webhooks may advance that state to `delivered` or `read`

### 10. What failure still means

If you still get:

```text
WhatsAppApiError: WhatsApp authentication failed. The access token is invalid or expired.
```

after generating a fresh token, then one of these is still mismatched:

- wrong Meta app
- wrong phone number ID
- expired token
- recipient not allowed in test mode
- token not generated from the actual WhatsApp test-number setup

Another common cause in local development:

- web and worker processes are still running with different env snapshots after a token change

## What to do when Meta credentials are corrected

Once the token/Meta configuration is valid, the expected successful cycle is:

1. customer sends reservation request
2. webhook arrives
3. lead is captured
4. task is created
5. acknowledgment is sent successfully
6. inbox shows outbound status as sent
7. lead status can progress toward contacted and confirmed

## Recommended next verification after token fix

When the token is fixed, repeat this exact restaurant flow:

1. log in to the restaurant tenant
2. post a signed inbound reservation webhook
3. open inbox
4. confirm contact, lead, and task creation
5. confirm outbound acknowledgment appears as `sent`
6. optionally send a manual WhatsApp reply from inbox
7. confirm staff can continue the thread

Then extend the same verification to:

- quote request
- callback request
- generic inquiry

## Known-good local verification snapshot

The final successful local verification used:

- app URL: `http://localhost:3000`
- tenant: `geneva-restaurant-e2e-jz3bc`
- Meta phone number id: `1128314047036398`
- WhatsApp Business Account id: `4516941348451035`
- allowed test recipient: `+41762147690`

Verified outcomes:

1. Signed webhook POST to `/api/webhooks/whatsapp` returned `200`.
2. The inbound reservation message appeared in tenant inbox.
3. CRM created a booking lead and stored extracted reservation facts.
4. Manual inbox reply succeeded with a real Meta `messageId`.
5. Automated acknowledgment succeeded with a real Meta `messageId`.

Successful automated acknowledgment body:

```text
Thanks for your request for Abdi Restaurant. We will confirm your booking shortly.
```

## Local env consistency rule

For local development, the same WhatsApp values must be kept in both:

- workspace root `.env.local`
- `apps/web/.env.local`

Why:

- `apps/web` reads its own app-local env file
- `apps/workers` loads from the workspace-root `.env.local`

If these differ, the result can be misleading:

- the web app may show WhatsApp as connected while workers use an expired token
- or the workers may send correctly while the web app says WhatsApp is not connected

After replacing `WHATSAPP_ACCESS_TOKEN`, restart both:

1. the web app
2. the workers

## Files involved

Main implementation files:

- `apps/web/src/app/api/webhooks/whatsapp/route.ts`
- `apps/workers/src/queues/whatsapp-inbound/worker.ts`
- `apps/workers/src/queues/lead-followup/worker.ts`
- `apps/web/src/server/trpc/routers/inbox.ts`
- `packages/integrations/whatsapp/client.ts`
- `packages/integrations/whatsapp/credentials.ts`
- `packages/shared/src/whatsapp-automation.ts`

## Practical summary

The implemented workflow is real and running.

Today it already does the heavy operational work:

- receives customer WhatsApp leads
- understands restaurant reservation requests
- writes structured CRM records
- creates staff follow-up work
- shows the whole state in inbox

The implemented workflow is real and working in local Meta test mode.

The main thing to protect now is deployment consistency:

- Vercel web env must match Fly worker env
- token rotation must restart workers
- inbox status should be interpreted as Meta acceptance first, then final delivery once webhook statuses arrive
