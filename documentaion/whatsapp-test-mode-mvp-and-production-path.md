# WhatsApp MVP Test Mode and Production Path

## Purpose

This document explains the WhatsApp setup we can use **right now** for MVP testing, and what we should do **later** when we have a real WhatsApp Business number.

The goal is simple:

- let one tenant test WhatsApp automation end to end
- capture customer messages into CRM
- allow inbox replies and AI-assisted responses
- keep the setup safe until the full Meta business onboarding is ready

This document uses one example tenant:

- **Tenant:** Abdi Restaurant
- **Location:** Neuchatel, Switzerland
- **Use case:** customer reservation and customer questions through WhatsApp

---

## Current MVP setup

Right now the app can work with:

- Meta **test phone number**
- Meta **temporary access token**
- our webhook callback route
- one configured tenant only

This is called **WhatsApp test mode**.

It is useful for:

- internal QA
- demos
- testing CRM capture
- testing inbox reply flow
- testing AI follow-up flow

It is **not** the final production setup for many customer tenants.

---

## What we configured in the app

The app now supports a strict single-tenant WhatsApp test mode:

1. Meta sends incoming WhatsApp webhook events to our app.
2. The app verifies the webhook request.
3. If the incoming phone number matches the configured Meta test number, the app routes the message to one specific tenant.
4. The tenant's CRM contact is created or updated.
5. The message is saved in the inbox.
6. The worker can generate and send a WhatsApp reply.
7. The tenant team can continue the conversation from the inbox.

This means the restaurant can already test a real workflow like:

- customer asks for a reservation
- CRM captures the lead
- inbox thread is created
- staff or AI can reply

---

## Environment variables for MVP test mode

Use these values in local or production environment variables:

```env
APP_URL=https://marketing-web-pied-nine.vercel.app
META_APP_SECRET=your_meta_app_secret
WHATSAPP_ACCESS_TOKEN=your_temporary_meta_token
WHATSAPP_PHONE_NUMBER_ID=your_meta_test_phone_number_id
WHATSAPP_VERIFY_TOKEN=marketing-wa-verify
WHATSAPP_TEST_MODE_ENABLED=true
WHATSAPP_TEST_TENANT_SLUG=abdi-restaurant
```

Notes:

- `WHATSAPP_ACCESS_TOKEN` can be temporary for MVP.
- `WHATSAPP_PHONE_NUMBER_ID` is the Meta **Phone Number ID**, not the visible phone number.
- `WHATSAPP_TEST_TENANT_SLUG` must be the tenant that should receive all test-number traffic.
- `META_APP_SECRET` is important for validating webhook signatures.
- in local development, the workspace-root `.env.local` and `apps/web/.env.local` must carry the same WhatsApp values
- in deployed environments, the Vercel web app and the Fly workers app must carry the same WhatsApp values

---

## Callback URL for Meta

Use this callback URL in the Meta dashboard:

```text
https://marketing-web-pied-nine.vercel.app/api/webhooks/whatsapp
```

Use this verify token in the Meta dashboard:

```text
marketing-wa-verify
```

You can replace the verify token later with your own custom secret value, as long as the same value exists in the environment variables.

---

## Environment parity rule

WhatsApp test mode only behaves reliably when the web app and workers are using the same current values.

These values must match exactly across both runtimes:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEST_MODE_ENABLED`
- `WHATSAPP_TEST_TENANT_SLUG`

Why this matters:

- the web app handles webhook verification, tenant-side inbox actions, and connection visibility
- the workers handle automated acknowledgments and workflow automation

If these runtimes drift apart, you can get confusing split behavior such as:

- inbox manual send works but automated reply fails
- workers send correctly but the web app says WhatsApp is not connected
- inbound capture works while outbound still uses an expired token

---

## Production parity checklist for Vercel and Fly

For the current deployed setup:

- **Vercel** hosts the Next.js web app
- **Fly.io** hosts the background workers

Before validating production WhatsApp automation, check this list:

1. In Vercel, confirm the web app has:
   - `META_APP_SECRET`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_TEST_MODE_ENABLED`
   - `WHATSAPP_TEST_TENANT_SLUG`
2. In Fly, confirm the workers app has the same six values.
3. Confirm both platforms use the same exact token string after every token refresh.
4. After changing the token:
   - redeploy or restart the Vercel web app
   - restart the Fly workers app
5. Then run one fresh inbound test from an allowed recipient number.

Recommended restart rule after token rotation:

- Vercel: trigger a fresh deployment or redeploy the current build
- Fly: restart the workers app so long-running processes pick up the new env

---

## What the current setup can do

With the current MVP test-mode setup, **Abdi Restaurant** can:

1. Receive incoming WhatsApp messages from Meta's test number flow.
2. Route those messages into the restaurant tenant.
3. Create or update a CRM contact using the sender phone number.
4. Store inbound and outbound WhatsApp messages in the inbox.
5. Let staff reply manually from the app inbox.
6. Let the worker send an AI-generated greeting or first reply.
7. Use the conversation as a lead source for reservations, questions, and follow-up.

Example:

- A customer sends: "Hello, I want to reserve a table for 4 people on Friday at 19:00."
- The app creates or updates the customer contact in CRM.
- The inbox thread appears for Abdi Restaurant.
- The worker can send a first reply such as:
  - "Hello, thank you for your message. We received your reservation request for Friday at 19:00 for 4 people."
- The restaurant team can continue manually from the inbox.

---

## What the current setup cannot do yet

The MVP test mode is intentionally limited.

It does **not** yet provide:

1. Full multi-tenant self-serve WhatsApp onboarding.
2. A real branded business phone identity for customers.
3. Long-term stable authentication, because temporary Meta tokens expire.
4. Per-tenant real WhatsApp business number connection for all tenants.
5. Full production-grade template messaging and large-scale tenant rollout.

So this setup is good for:

- proving the product flow
- validating CRM and inbox behavior
- internal or boss demo
- early design-partner testing

But it is not the final customer rollout model.

One more important detail:

- a message being marked `sent` in the app means Meta accepted it
- final delivery to the phone depends on later Meta status webhooks such as `delivered` and `read`

---

## Restaurant workflow example

### Scenario

Tenant:

- **Abdi Restaurant**
- Neuchatel, Switzerland

Customer action:

- customer sends a WhatsApp message asking for a reservation

System result:

- the message becomes a CRM contact + inbox conversation

### Example message flow

1. Customer sends:
   - "Hi, do you have a table for 2 tonight at 20:00?"
2. Meta forwards the event to our callback URL.
3. The app verifies the event.
4. The app maps the test number traffic to `abdi-restaurant`.
5. A CRM contact is created or updated.
6. The inbound message is saved.
7. The worker creates an AI or fallback reply.
8. The reply is sent back through Meta.
9. Staff can see and continue the thread in the inbox.

In a known-good test run, both of these were verified:

- manual inbox reply succeeded with a real Meta `messageId`
- automated restaurant acknowledgment also succeeded with a real Meta `messageId`

---

## Workflow graphic

```mermaid
flowchart LR
  A[Customer sends WhatsApp message] --> B[Meta test number]
  B --> C[/api/webhooks/whatsapp]
  C --> D[Verify webhook and signature]
  D --> E[Route to Abdi Restaurant tenant]
  E --> F[Queue whatsapp-inbound job]
  F --> G[Create or update CRM contact]
  G --> H[Store inbound message in inbox]
  H --> I[Generate AI or fallback reply]
  I --> J[Send reply through Meta WhatsApp API]
  J --> K[Store outbound message]
  K --> L[Restaurant team sees full conversation in CRM inbox]
```

---

## What we should do after we get the real business number

Once we have a real WhatsApp Business number, we should move from test mode to the normal production path.

### Production transition steps

1. Register the real business phone number in Meta.
2. Complete Meta business verification.
3. Complete WhatsApp display-name approval if required.
4. Generate a **permanent** access token.
5. Connect the tenant properly through the app integration flow.
6. Store the real tenant connection in `integration_connections`.
7. Store the real `phoneNumberId` in tenant connection metadata.
8. Keep using the same callback URL unless the deployment domain changes.
9. Turn off WhatsApp test mode.

### Environment changes later

When the real business number is live:

```env
WHATSAPP_TEST_MODE_ENABLED=false
```

After that, the tenant should rely on its connected integration credentials instead of the test-mode env fallback.

---

## Recommended production behavior after the real number is ready

For the real production setup, each tenant should eventually have:

- its own connected WhatsApp business account or approved shared onboarding flow
- real tenant-scoped access token storage
- tenant-specific phone number ID
- normal webhook routing through stored integration metadata
- no dependency on a temporary global test token

This gives us:

- correct tenant isolation
- stable authentication
- real customer-facing business identity
- safer production operations

---

## Practical MVP example for Abdi Restaurant

### What the restaurant can already test

Abdi Restaurant can already test these scenarios:

- reservation request
- opening-hours question
- menu or allergy question
- location question
- quick follow-up from staff in inbox

### Business benefit right now

Even with the Meta test-number setup, the restaurant already gets:

- better lead capture
- centralized conversation history
- CRM contact creation
- less manual copying of customer details
- faster reply workflow

That is enough for MVP validation.

---

## Final recommendation

Use the current test-mode setup as an **MVP validation bridge**:

- good for internal testing
- good for demos
- good for one tenant pilot like Abdi Restaurant

Then move to the real business-number setup for production rollout:

- real business number
- permanent token
- verified business
- tenant-connected WhatsApp integration

That gives us a clean path:

- **now:** prove the workflow
- **next:** harden the production onboarding
