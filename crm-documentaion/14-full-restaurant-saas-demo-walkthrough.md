# Full SaaS Demo Walkthrough: Sweet Restaurant

Last updated: 2026-07-06

This is the production client-demo script for a fresh restaurant tenant. It starts at signup and
ends with CRM/SMS automation proof. Use it as a presenter guide: say the short explanation, click
the listed UI, paste the provided text, then verify the expected result.

## Demo Profile

Use this demo identity unless production already has the email.

| Field               | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| Business name       | Sweet Restaurant                                                  |
| Business type       | Restaurant                                                        |
| City                | Neuchatel                                                         |
| Owner name          | Abdi Ahmed                                                        |
| Owner email         | abdi.ahmed.huss@gmail.com                                         |
| Fallback email      | abdi.ahmed.huss+sweetrestaurant-demo@gmail.com                    |
| Phone / SMS proof   | +41762147690                                                      |
| UI language         | English                                                           |
| AI content language | English                                                           |
| Main offer          | Seasonal menu, terrace events, private dining, group reservations |

## Presenter Rules

- Use production, because the client demo depends on real environment variables and SMS provider
  configuration.
- Do not demo unfinished email automation as the main path. If email appears, frame it as optional
  sender setup.
- Real SMS is allowed in this walkthrough, but only to `+41762147690`.
- If a blocking issue appears, pause the demo and ask whether to fix immediately.
- If a non-blocking issue appears, record it in the issue log at the bottom of this file.
- Explain every feature in restaurant-owner language: more bookings, faster follow-up, less missed
  guest communication.

## 1. Signup And First Login

**What to say**

> We are starting exactly like a new restaurant owner would. The signup creates the owner account,
> the restaurant workspace, and the first trial tenant.

**Click path**

1. Open the production app.
2. Click `Sign up`.
3. Fill the signup form.

**Use these values**

```text
Name: Abdi Ahmed
Email: abdi.ahmed.huss@gmail.com
Business name: Sweet Restaurant
Password: choose a private demo-safe password
```

If the email already exists:

```text
Email: abdi.ahmed.huss+sweetrestaurant-demo@gmail.com
```

**Expected result**

- Signup succeeds.
- You land in the dashboard or setup flow.
- If you are redirected to login, log in with the same email/password.

**If something goes wrong**

- Email already exists: use the fallback Gmail alias and explain duplicate-account protection.
- Login button does nothing: hard refresh once. If it still fails, mark as blocking auth regression.
- Unexpected logout after clicking app pages: mark as blocking auth/session regression.

## 2. Business Setup

**What to say**

> This page teaches the AI what kind of business this is. The same profile is reused for posts,
> landing pages, lead forms, CRM follow-up, and automation.

**Click path**

1. Open `Settings` from the sidebar.
2. If needed, open `/en/dashboard/setup`.
3. Fill the business profile.

**Use these values**

```text
Business Name: Sweet Restaurant
Industry: Restaurant
AI Content Language: English
City: Neuchatel
Preferred confirmation channel: SMS first
Automatic acknowledgements: enabled
AI reply assistance: enabled
```

Reservation confirmation wording:

```text
Thanks for contacting Sweet Restaurant. We received your reservation request and will confirm availability shortly.
```

**Click**

- Click `Create profile & continue` or `Save changes`.

**Expected result**

- Profile saves.
- The app routes to the next onboarding/content page or stays on settings with saved values.

**Presenter note**

Explain that `SMS first` means urgent guest confirmations can use the quickest channel, while staff
still controls real reservation commitments.

## 3. Copilot Introduction

**What to say**

> The floating assistant is not just a chat bubble. It can inspect the tenant workspace, summarize
> what exists, and propose actions. Read-only checks run automatically; changes require confirmation.

**Click path**

1. Click the purple floating AI chat button in the bottom-right corner.
2. Send the first prompt.

**Prompt 1**

```text
Check if my setup is ready for launch.
```

**Expected result**

- Copilot returns a launch readiness summary.
- It may mention missing landing pages, forms, captured leads, email sender, or automation.

**Prompt 2**

```text
Give me a simple launch checklist for Sweet Restaurant in Neuchatel.
```

**Expected result**

- Copilot gives a plain checklist for setup, page, lead capture, CRM, and automation.

**Presenter note**

If the assistant proposes a mutation, point out the confirm button and say:

> The app does not let AI silently change the business. The owner confirms actions first.

## 4. Brand Kit

**What to say**

> The brand kit is where the restaurant adds its voice and positioning. This helps the AI avoid
> generic text and keep every output consistent.

**Click path**

1. Open `Brand Kit` from the sidebar.
2. Add or update the available brand fields.

**Use these values**

```text
Primary colour: keep the default dark colour for now, or choose a warm dark restaurant colour.
Secondary colour: keep the default neutral grey for now.
Heading font: System UI (default)
Body font: System UI (default)
Brand voice: Warm, welcoming, seasonal, local. Premium but friendly. Mention seasonal menus, terrace events, private dining, and group reservations.
```

**Expected result**

- Brand details save.
- Future AI content should feel restaurant-specific.

**Issue to watch**

The current Brand Kit has only a compact `Brand voice` field for positioning. That is enough for
the demo, but record a product improvement:

```text
Brand Kit should add clearer fields for audience, main offer, style notes, and avoid-phrases so
non-technical tenants can guide AI without squeezing everything into Brand voice.
```

## 5. AI Social Post

**What to say**

> Before building the website, we show the daily marketing use case: a restaurant owner can create
> a polished post from a short idea.

**Click path**

1. Open `Posts`.
2. Click `New post`.
3. Fill the post form.

**Topic**

```text
Announce Sweet Restaurant's seasonal dinner menu and invite guests in Neuchatel to book a table this weekend.
```

**Highlights**

```text
Warm neighborhood restaurant, seasonal dishes, terrace seating, private dining for groups, reservation recommended.
```

**Click**

- Click `Generate`.

**If image generation tools are visible**

Use this image prompt:

```text
Cozy Swiss neighborhood restaurant table with seasonal dinner plates, warm evening light, welcoming but premium.
```

**Expected result**

- A draft caption appears.
- If creative/image tools are configured, an image or design asset appears.

**Presenter note**

Explain that this is for everyday content. The next step builds the page that converts attention
into reservations.

## 6. Restaurant Website / Landing Page Generation

**What to say**

> Now we ask AI to create the restaurant website or campaign page. The AI plans and writes, but the
> app renders only registered, safe, editable components.

**Click path**

1. Open `Landing Pages`.
2. Click `New page`.
3. Choose `AI wizard`.

**Wizard selections**

```text
Locale: English
Vertical: Restaurant
Goal: Drive event signups
Lead preset: Reservation
Site mode: Small business website
Image strategy: Curated
```

If `Drive event signups` is not available or does not fit the UI, choose:

```text
Goal: Capture leads
Lead preset: Reservation
```

**Brief**

```text
Warm neighborhood restaurant in Neuchatel with seasonal menus, terrace events, private dining, and group reservations. The goal is to collect reservation and private event inquiries from local guests.
```

**Click**

- Click `Generate`.
- Wait for generation to finish and open the editor.

**Expected result**

- The page opens in the landing page editor.
- It should feel like a restaurant/private dining page, not a generic service or retail page.
- The form should collect reservation-style details.

**Issue to watch**

Record as high priority if:

- The page is classified as retail, agency, or generic service.
- CTA labels say `Request quote` instead of reservation/event language.
- Images are not restaurant/hospitality relevant.
- Mobile preview has overlapping text or cramped buttons.

## 7. Edit And Publish The Page

**What to say**

> This is where the tenant can recover from imperfect AI output. They can edit copy, theme, layout,
> and images without touching code.

**Click path**

1. In the editor, check `Desktop`.
2. Check `Mobile`.
3. Open the theme picker.
4. Try 2-3 named themes.
5. Open the hero section layout/variant switcher.
6. Open one middle-section variant switcher, ideally gallery/menu/about.

**If hero heading needs improvement**

Use:

```text
Seasonal Dining and Private Events in Neuchatel
```

**If CTA needs improvement**

Use:

```text
Request a Reservation
```

**Click**

- Publish the page.
- Open the public preview.

**Expected result**

- Public page matches editor theme/layout.
- Mobile page is readable.
- CTA/form is restaurant reservation oriented.

**Presenter note**

Point out that the architecture is safe: AI does not generate arbitrary live code; the editor swaps
registered sections, themes, and form presets.

## 8. Forms And Lead Capture

**What to say**

> A pretty page is not enough. The form turns visitors into CRM records and staff work.

**Click path**

1. Open `Forms`.
2. Confirm a reservation form exists from the generated page.
3. If no form exists, create a reservation form or return to the page editor and verify the lead
   form section.
4. Open the public page preview.
5. Submit a test reservation lead.

**Expected reservation fields**

- Name
- Email
- Phone
- Preferred channel
- Date/time
- Guests
- Message or occasion

**Test lead**

```text
Name: Demo Guest
Email: abdi.ahmed.huss+guest@gmail.com
Phone: +41762147690
Guests: 4
Message: We would like a table this Friday evening and want to ask about terrace seating.
```

If date/time fields are present, use:

```text
Date: next Friday
Time: 19:00
```

**Expected result**

- Form submission succeeds.
- A lead/contact is created.
- Staff notification or inbox item may appear.

**Issue to watch**

If the form does not collect phone number for reservation/SMS flow, record as blocking for this demo.

## 9. CRM Contacts

**What to say**

> The guest request is now organized in CRM. Staff can see who contacted the restaurant, what they
> asked for, and what action is needed next.

**Click path**

1. Open `CRM`.
2. Search for `Demo Guest`.
3. Open the contact.
4. Review source, lifecycle stage, lead score, tasks, and activity.

**Copilot prompt**

```text
Show my recent leads.
```

**Expected result**

- `Demo Guest` appears as a recent lead/contact.
- The contact should include the submitted email/phone and reservation context.

**Presenter note**

Explain that the restaurant does not lose website requests in email threads; each request becomes a
structured customer record.

## 10. CRM Inbox

**What to say**

> The inbox is the daily staff work surface. It shows guest messages, automation issues, and next
> actions.

**Click path**

1. Open `CRM`.
2. Open `Inbox`.
3. Find the latest `Demo Guest` or reservation request thread.
4. Review the request summary and any action panel.

**If AI/staff reply assistance is visible**

Use or explain:

```text
Please draft a friendly reply asking the guest to confirm whether terrace seating is preferred.
```

**Expected result**

- The reservation request appears in the inbox.
- Staff can review before making commitments.
- If reservation action buttons exist, they should be clear: confirm, decline, ask for details, or
  mark contacted.

**Presenter note**

Say:

> AI can draft and organize, but staff stays in control for reservation commitments.

## 11. Deals / Reservation Opportunity

**What to say**

> Restaurants often have higher-value opportunities: private dining, group reservations, catering,
> or events. Deals track those opportunities separately from ordinary table bookings.

**Click path**

1. Open `Deals`.
2. Create a new deal if there is no relevant one.

**Deal values**

```text
Deal name: Friday terrace reservation - Demo Guest
Value: 240
Currency: CHF
Stage: Open
```

**Click**

- Save the deal.
- Move it through the Kanban only if it helps the story.

**Expected result**

- Deal appears in the open column.
- Forecast/pipeline totals update.

**Presenter note**

Explain that a normal reservation may not need a deal, but private dining and group bookings do.

## 12. Segments

**What to say**

> Segments are reusable guest lists. They help the restaurant avoid sending the same message to
> everyone.

**Click path**

1. Open `CRM`.
2. Open `Segments`.
3. Create or show a segment.

**Segment idea**

```text
Guests interested in private dining or events
```

**If rule builder supports tags**

Use:

```text
Tag contains reservation-guest
```

or:

```text
Tag contains private-dining
```

**Expected result**

- Segment saves or displays matching contacts.

**Presenter note**

Explain marketing consent clearly:

> Transactional reservation follow-up is different from marketing. Promotional campaigns should
> only go to guests with the right opt-in.

## 13. Integrations / SMS Readiness

**What to say**

> Before automating SMS, the tenant must have a valid SMS setup, quota, and verified phone context.
> This protects guests and prevents accidental sends.

**Click path**

1. Open `Integrations`.
2. Check SMS/WhatsApp status.
3. If there is a phone verification area, verify the business phone.

**Phone**

```text
+41762147690
```

**Expected result**

- SMS provider appears configured or test mode is available.
- Business phone is verified, or the SMS automation page shows a clear reason why SMS is blocked.

**If verification code is sent**

- Read the code from the phone.
- Enter it in the app.
- Confirm verification succeeds.

**Issue to watch**

Record as blocking if:

- SMS page says provider is not configured in production.
- Plan does not allow SMS and no upgrade path is clear.
- Quota is exhausted before the demo.

## 14. SMS Automation

**What to say**

> This is the final proof: a website lead can become a CRM contact and trigger a short,
> controlled SMS workflow.

**Click path**

1. Open `SMS automation`.
2. Check the cards: plan, monthly SMS, remaining quota, business phone.
3. Click `Install restaurant presets`.

**Expected result**

- Presets install or already exist.
- Restaurant sequences/templates appear.

**AI draft path**

Click `Create AI draft` after setting this purpose:

```text
Create a restaurant reservation confirmation and reminder sequence for Sweet Restaurant in Neuchatel. Keep it transactional, friendly, short, and useful for guests who requested a reservation.
```

**Expected result**

- AI creates SMS templates and a paused sequence.
- Review before activation.

**Manual fallback template**

If AI draft fails or you want a controlled path, create this template:

```text
Template name: Reservation received
Body: Hi {{first_name}}, Sweet Restaurant received your reservation request. We will confirm availability shortly. Thank you.
Transactional message: checked
```

**Manual sequence**

```text
Sequence name: Reservation request follow-up
Trigger: Lead captured
Lead kind: Reservation
Workflow state: leave blank
Step 1 template: Reservation received
Step 1 wait minutes: 0
Step 1 purpose: Transactional
```

Click:

- `Save paused sequence`
- In the sequence table, click `Activate`

**Manual enrollment only if needed**

If the automatic trigger does not run during the demo:

1. Create a manual sequence instead, or use an existing manual sequence.
2. Choose the `Demo Guest` phone contact.
3. Click `Enroll contact`.

**Expected result**

- Recent enrollment appears.
- SMS status appears as queued/sent/delivered or a clear failure reason.
- Physical phone `+41762147690` receives the SMS.

**Presenter note**

Say:

> This completes the loop: page visitor -> reservation form -> CRM contact -> staff workflow ->
> SMS follow-up.

## 15. Final Copilot Launch Audit

**What to say**

> At the end, the owner can ask the copilot what is ready and what still needs attention.

**Click path**

1. Open the floating copilot.
2. Send both prompts.

**Prompt 1**

```text
Audit my launch readiness for Sweet Restaurant and tell me what is missing before I present this to real guests.
```

**Prompt 2**

```text
Summarize my current contacts, pages, forms, and automation status.
```

**Expected result**

- Copilot summarizes current setup.
- It should mention page/forms/leads/automation health.

**Presenter close**

> The system gives the restaurant owner a complete flow: create marketing, publish a page, capture
> guest requests, organize them in CRM, and follow up by SMS.

## Screenshot Checklist

Capture these during the private production run:

- Signup or first dashboard after signup
- Business setup saved
- Copilot launch readiness answer
- Brand Kit
- AI social post result
- Landing wizard review
- Landing editor desktop
- Landing editor mobile
- Theme picker open
- Hero variant switcher open
- Published public page
- Submitted reservation form
- CRM contact for Demo Guest
- Inbox reservation thread
- Deal created
- Segment page
- Integrations/SMS readiness
- SMS automation sequence
- Recent SMS enrollment/status
- Physical phone SMS
- Final copilot launch audit

## Demo Confidence Ratings

After the private run, rate each area from 1-10.

| Area                           | Rating | Notes |
| ------------------------------ | -----: | ----- |
| Signup/login                   |        |       |
| Business setup                 |        |       |
| Copilot                        |        |       |
| Brand Kit                      |        |       |
| Social post                    |        |       |
| Landing page generation        |        |       |
| Landing editor                 |        |       |
| Public page/mobile             |        |       |
| Forms/lead capture             |        |       |
| CRM contact                    |        |       |
| Inbox                          |        |       |
| Deals                          |        |       |
| Segments                       |        |       |
| Integrations/SMS readiness     |        |       |
| SMS automation                 |        |       |
| Overall client-demo confidence |        |       |

## Issue Log

Use this while walking through production. Fix immediately only if the issue blocks the client demo.

| Step | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Severity  | Screenshot                                     | Decision                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------- | -------------------------- |
| 2    | After saving the business profile, the app redirects directly to `Create a new social media post`. For a new-tenant presentation, this jumps ahead before Copilot and Brand Kit, so the onboarding flow feels less logical. Recommended improvement: after profile setup, route to a launch checklist/dashboard or guided next-step screen with `Set brand`, `Ask copilot`, `Create first post`, and `Create landing page`.                                                               | Important | 2026-07-06 setup redirect screenshot           | Record for polish          |
| 3    | Copilot launch readiness correctly flagged missing published page, active form, and CRM leads, but it emphasizes `Active email sequence` and does not mention SMS readiness/automation. For restaurant demos where SMS is the primary proof path, launch readiness should include SMS provider/phone/quota/sequence status and prioritize SMS when the tenant selected SMS-first follow-up.                                                                                               | Important | 2026-07-06 copilot launch audit response       | Record for polish          |
| 3    | Copilot returned the same launch-readiness audit when asked for a simple launch checklist. It should transform the audit into ordered next actions for a non-technical restaurant owner instead of repeating the diagnostic response.                                                                                                                                                                                                                                                     | Important | 2026-07-06 repeated copilot response           | Record for polish          |
| 4    | Brand Kit does not have explicit fields for audience, main offer, style notes, or avoid-phrases. The only positioning field is `Brand voice` with a 300-character limit, so restaurant-specific guidance has to be compressed. Add structured brand guidance fields later.                                                                                                                                                                                                                | Important | 2026-07-06 Brand Kit screenshot                | Record for polish          |
| 4    | Brand Kit accepts a Bing search/detail URL in `Logo URL`, but that is not a direct image file and likely will not render. Add validation/help text that asks for a direct image URL ending in `.png`, `.jpg`, `.jpeg`, `.webp`, or use upload/media library.                                                                                                                                                                                                                              | Important | 2026-07-06 Brand Kit logo URL screenshot       | Record for polish          |
| 5    | Social post designed graphic failed in production: first the preview used a broken UUID-like asset URL, then `Create graphic` failed when premium background generation could not see `REPLICATE_API_TOKEN`. Fix implemented: UI/API now use the stable `/api/social-creatives/{jobId}/image` route, direct `Create graphic` saves a completed registered creative plan immediately, and the worker falls back to the designed graphic when premium background generation is unavailable. | Blocking  | 2026-07-06 social graphic screenshot + console | Fixed; redeploy and retest |

## Known Scenario Branches

### Signup Email Already Exists

Use:

```text
abdi.ahmed.huss+sweetrestaurant-demo@gmail.com
```

Explain:

> The app prevents duplicate owner accounts with the same email. Gmail aliases let us create a clean
> demo tenant without using a different inbox.

### Landing Page Generation Stays Pending

1. Wait one minute.
2. Refresh landing pages list.
3. If still pending, record job issue.
4. Continue only if another suitable draft is available.

### SMS Not Allowed

Show the SMS cards and explain the reason exactly:

- Plan does not include SMS.
- Provider is not configured.
- Monthly limit is reached.

Do not claim SMS worked unless the app records the send and the physical phone receives it.

### No Phone Contact In SMS Enrollment

Submit the public reservation form again with:

```text
Name: Demo Guest
Phone: +41762147690
Email: abdi.ahmed.huss+guest@gmail.com
```

Refresh `SMS automation`.

### Email Automation Appears

Say:

> Email automation exists, but today the restaurant proof path is SMS because it is faster for
> reservation follow-up. Email sender setup can be demonstrated separately after sender readiness is
> verified.
