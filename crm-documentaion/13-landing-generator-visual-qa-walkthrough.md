# Landing Generator Visual QA Walkthrough

Use this checklist to validate the upgraded website and landing-page generator from a real tenant's point of view. It covers wizard setup, AI generation, planner classification, theme and background quality, section variants, imagery, editing, lead capture, publishing, and public rendering.

This is a manual visual QA pass. Screenshots and tenant-style judgment should drive the next polish fixes.

## Setup

- Use a test tenant with access to landing pages, forms, the landing editor, and publish actions.
- Use the AI wizard entry point from the landing-pages creation flow.
- Keep email automation paused. This walkthrough is landing-page only.
- Use curated images by default. AI image generation is optional and only expected to work when `REPLICATE_API_TOKEN` is configured.
- Do not add more generator code during the walkthrough unless a blocking runtime bug prevents generation.

For every scenario, capture:

- Wizard review screen before generation.
- Editor desktop preview.
- Editor tablet preview.
- Editor mobile preview.
- Theme picker open.
- Variant switcher open for hero.
- Variant switcher open for one middle section, preferably gallery, about, offer, or lead form.
- Published public preview after publish, if publishing is safe in the test tenant.

Review every generated page against these criteria:

- Business type is correctly classified.
- Page looks premium, modern, and industry-appropriate.
- Theme, typography, radius, shadow, and background feel coherent.
- Images are relevant and not obviously generic.
- Section order matches the page goal.
- CTAs and form fields match the selected lead preset.
- Mobile layout has no overlap, cramped text, broken image crop, tiny tap target, or huge empty gap.

## Scenario Matrix

### 1. Modern Web Design Agency

- Locale: English.
- Vertical: Service.
- Goal: Capture leads.
- Lead preset: Quote request.
- Site mode: Small business website.
- Image strategy: Curated.
- Brief: "Modern web design agency for Swiss SMEs, branding, SEO, conversion websites, and premium redesigns."

Expected:

- Classified as agency or digital, not retail.
- Hero uses a bold agency/startup direction, ideally `agency-bento`.
- Gallery or proof section feels like portfolio or case-study proof.
- Theme avoids cafe, clinic, retail, and bland generic-service styling.
- Copy mentions qualified leads, conversion, project brief, outcomes, or redesign value.

### 2. Residential Real Estate Agency

- Locale: English or de-CH.
- Vertical: Service.
- Goal: Capture leads.
- Lead preset: Callback or Quote request.
- Site mode: Small business website.
- Image strategy: Curated.
- Brief: "Boutique real estate agency for residential property sales, valuations, buyer inquiries, and viewing requests."

Expected:

- Classified as real estate, not retail-fashion.
- Hero uses property/showcase direction, ideally `property-showcase`.
- Theme feels premium and trustworthy, not neon, purple startup, or playful.
- Copy focuses on property goals, viewings, valuation, advice, and local trust.
- Imagery feels professional, property-adjacent, or service-led, not fashion.

### 3. Clinic Appointment Booking

- Locale: fr-CH or de-CH.
- Vertical: Clinic.
- Goal: Book appointments.
- Lead preset: Callback.
- Site mode: Small business website.
- Image strategy: Curated.
- Brief: "Family dental clinic offering preventive care, aesthetic treatments, emergency appointments, and calm patient guidance."

Expected:

- Classified as clinic/trust.
- Hero feels calm, clinical, and trustworthy, ideally `clinic-trust`.
- Theme avoids loud gradients and aggressive startup styling.
- About section emphasizes trust proof.
- Lead form clearly sets appointment expectations.
- Mobile preview is especially clean and readable.

### 4. Local Trades Quote Service

- Locale: de-CH.
- Vertical: Service.
- Goal: Capture leads.
- Lead preset: Quote request.
- Site mode: Campaign landing page.
- Image strategy: Curated.
- Brief: "Electrician and solar repair team offering fast quote requests, emergency help, installation checks, and local service in Bern."

Expected:

- Classified as local trades.
- Page is conversion-first and practical, not editorial or luxury.
- Offer and lead-form copy focus on quote request, urgency, project details, and next step.
- Campaign mode stays focused on one primary action.
- Form fields and channels fit quote capture.

### 5. Restaurant Private Event Signup

- Locale: de-CH or fr-CH.
- Vertical: Restaurant.
- Goal: Drive event signups.
- Lead preset: Reservation.
- Site mode: Small business website.
- Image strategy: Curated.
- Brief: "Warm neighborhood restaurant with private dining, seasonal menus, terrace events, and group reservations."

Expected:

- Classified as restaurant or event-friendly, not generic service.
- Section order includes menu, gallery, event, offer, or proof flow where appropriate.
- Imagery is food, hospitality, space, or venue relevant.
- CTA matches reservation or event inquiry.
- Copy mentions date, guests, group dining, private dining, availability, or seasonal menu.

### 6. Retail Boutique Promotion

- Locale: it-CH or English.
- Vertical: Retail.
- Goal: Promote a sale.
- Lead preset: Newsletter or WhatsApp-first.
- Site mode: Campaign landing page.
- Image strategy: Curated.
- Brief: "Independent fashion boutique with seasonal collection, styling advice, limited weekend sale, and local pickup."

Expected:

- Retail-fashion classification is correct.
- Theme may be expressive, but still polished.
- Sales promo feels urgent without looking cheap.
- Gallery or product sections show retail and product detail.
- Lead capture fits newsletter, WhatsApp, or product inquiry.

### 7. SaaS / Software Startup

- Locale: English.
- Vertical: Service or Other/custom if available.
- Goal: Capture leads.
- Lead preset: Callback or Quote request.
- Site mode: Small business website.
- Image strategy: Curated.
- Brief: "B2B SaaS platform for appointment automation, analytics, and CRM workflows for small service businesses."

Expected:

- Classified as software or SaaS.
- Theme can use modern startup inspiration, grid or spotlight background, and sharper component rhythm.
- Imagery uses creative, studio, or software-adjacent bundle, not cafe or clinic.
- Copy explains product outcomes and demo or consultation next step.

### 8. Multi-Language Website

- Default locale: de-CH.
- Additional locales: fr-CH and it-CH.
- Vertical: Cafe or Clinic.
- Goal: Inform visitors plus secondary lead capture.
- Lead preset: Reservation for cafe, Callback for clinic.
- Site mode: Small business website.
- Image strategy: Curated.

Expected:

- Language switcher appears.
- Localized page shells render for each locale.
- Copy does not show mixed-language leftovers.
- Swiss conventions feel correct:
  - de-CH avoids German-German tone.
  - fr-CH feels Swiss French.
  - it-CH feels Ticino-appropriate.
- Theme and layout remain consistent across locales.

## Editor Interaction Checklist

Run this checklist on at least scenarios 1, 2, 3, and 4. Run it on all scenarios if time allows.

### Theme Browser

- Open the theme picker.
- Switch between at least three named themes.
- Confirm palette chips are visible.
- Confirm typography preview is visible.
- Confirm radius, tags, and background style are visible.
- Confirm the preview reloads and the theme persists after refresh.

### Background Style

- Try themes that use these styles where available:
  - `clean`
  - `paper`
  - `grid`
  - `spotlight`
  - `subtle-noise`
  - `image-led`
- Confirm backgrounds improve polish without hurting contrast or readability.

### Variant Switcher

- Swap the hero variant.
- Swap one gallery, about, offer, or lead-form variant.
- Confirm only registered variants appear.
- Confirm the preview reloads correctly.
- Confirm the layout does not break after switching variants.

### Device Preview

- Check desktop, tablet, and phone.
- Look for:
  - Overflow.
  - Overlapping text.
  - Broken image crops.
  - Cramped buttons.
  - Text too small or too large.
  - Excessive empty space.
  - Sections that feel out of order.

### Content Editing

- Edit a hero heading.
- Edit a form or CTA heading.
- Save by blur or supported shortcut.
- Refresh preview and confirm the change persists.

### Images

- Open the image swap modal for the hero image.
- Try stock library.
- Try paste URL.
- Confirm the selected image appears.
- Confirm the image does not distort layout on desktop or mobile.

## Lead Capture And Publish Checks

For each scenario where publishing is safe:

- Publish the page.
- Open the public URL.
- Submit a test lead with safe test data.
- Confirm the lead form fields match the selected preset:
  - Reservation: guest/contact-style fields.
  - Quote: project/context fields.
  - Callback: phone-first.
  - Newsletter: lightweight email capture.
  - WhatsApp-first/SMS fallback: channel emphasis is visible.
- Confirm public page matches editor preview.
- Confirm public mobile page matches mobile editor quality.
- Confirm website mode subpages work.
- Confirm campaign mode stays focused and does not expose unnecessary navigation.

## Issue Reporting Template

Use this template for every scenario you send back.

```markdown
## Scenario

Name:
Locale:
Vertical:
Goal:
Lead preset:
Site mode:
Image strategy:

## Screenshots

- Wizard review:
- Editor desktop:
- Editor tablet:
- Editor mobile:
- Theme picker:
- Hero variant switcher:
- Middle-section variant switcher:
- Public desktop:
- Public mobile:

## Ratings

- Visual premium feel: /10
- Business fit: /10
- Copy quality: /10
- Image relevance: /10
- Mobile quality: /10

## Notes

- Looks wrong because:
- Feels cheap/generic because:
- This business should feel more:
- I expected this CTA/form/section:
- Bugs or broken interactions:
```

## Acceptance Criteria

The upgrade passes visual QA when:

- Web agency and real estate no longer look like retail or fashion.
- Each representative vertical gets a distinct visual direction.
- Theme selection feels like professional bundles, not random color picking.
- Background styles improve polish without raw generated CSS.
- New variants appear only through the registered-component architecture.
- Generated copy is section-specific and goal-specific.
- Images are relevant enough for first-draft quality.
- Editor controls let a tenant recover from imperfect generation.
- Desktop and mobile previews look production-ready for at least 6 of the 8 scenarios.

## Follow-Up Triage

After screenshots are collected, group issues into:

- Blocking runtime bugs: generation, editor, publish, form submit, preview route.
- Classification failures: wrong subvertical, wrong archetype, wrong section order.
- Visual polish failures: weak theme, poor spacing, weak hierarchy, poor mobile rhythm.
- Copy failures: generic headings, wrong CTA, wrong locale tone, missing conversion detail.
- Imagery failures: irrelevant bundle, poor crop, repeated image, low first-draft quality.
- Editor UX failures: confusing theme picker, variant switcher, image swap, persistence.

Fix blocking runtime bugs first, then classification failures, then visual polish.
