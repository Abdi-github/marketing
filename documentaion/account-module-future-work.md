# Account Module Future Work

## Current State

The account module currently covers:

- Account overview with readiness checklist for business profile, brand, website domains, billing, and email sender verification.
- Brand kit with logo URL, primary/secondary colors, heading/body fonts, and voice tone.
- Custom website domains with DNS ownership verification, primary domain selection, and public routing.
- Billing summary with current plan, monthly AI budget usage, recent invoices, and Stripe Checkout upgrades.
- Settings/business profile with business name, vertical, city, dashboard language, and AI content language.

## Near-Term Polish

- Add full i18n coverage for the new account overview and newer account labels.
- Add visual QA with Browser/Playwright for account overview, brand save, domain add/verify modal, billing page, and settings save.
- Replace hardcoded dashboard labels such as Domains and Email settings with message keys.
- Make Account Overview the default first stop for Account instead of making users jump between isolated pages.

## Permissions And Safety

- Keep Brand, Domains, and Billing mutations admin-gated. Editors and viewers should be able to read account state but not change production identity, DNS, or payment settings.
- Add role-based UI affordances so non-admin users see disabled actions with clear explanations instead of only backend errors.
- Add an account audit log for changes to brand kit, business profile, domains, billing plan, sender domains, and data-erasure requests.
- Add confirmation flows for high-risk actions: remove domain, cancel subscription, request erasure, remove team member, transfer ownership.

## Brand Enhancements

- Add proper logo/favicon/social-image upload through object storage instead of URL-only logo input.
- Add brand asset library: logos, product photos, team photos, color swatches, reusable backgrounds, and approved image directions.
- Add AI brand extraction from an existing website URL or uploaded logo: colors, typography direction, tone, keywords, and visual style.
- Add brand voice examples, banned words, preferred CTAs, and phrase library so generation outputs are more consistent.
- Add live previews for brand usage across landing pages, social graphics, emails, and forms.
- Add per-channel brand overrides when needed, for example more formal email tone but bolder social graphics.

## Domains Enhancements

- Configure `DOMAIN_CERT_PROVIDER=fly` or `webhook` in production and validate real certificate issuance end to end.
- Add alert routing/dashboards for expiring or failed certificates; the worker now schedules daily renewal scans and enqueues renewals for certs expiring within 30 days.
- Always fetch DNS instructions from the server when opening the modal; avoid browser-side mirrored DNS values that can drift from environment config.
- Add domain health checks: DNS verification, A/CNAME correctness, HTTPS status, canonical redirect, and public page reachability.
- Add per-page domain assignment for tenants running multiple brands or campaigns.
- Emit a `domain.live` outbox event when a domain becomes live.

## Billing Enhancements

- Add Stripe Customer Portal for payment method updates, invoice downloads, subscription cancellation, and plan changes.
- Add downgrade/cancel flows with end-of-period messaging and retention survey.
- Add Swiss invoice details: company name, billing email, street, postal code, city, VAT/MWST number, and invoice recipient.
- Add usage breakdown by feature: social posts, image generation, landing pages, forms, email, CRM automation, and integrations.
- Add plan-limit explanations and upgrade prompts at the point of friction, not only on the billing page.
- Add annual billing and coupon/promotion handling once pricing strategy is stable.

## Settings And Team

- Add team management: invite user, resend invite, change role, remove member, transfer ownership.
- Add notification preferences for billing alerts, domain issues, form leads, campaign approvals, weekly reports, and security events.
- Add security settings: active sessions, password change, two-factor authentication, login history, and API keys.
- Expand business profile with street, postal code, phone, email, opening hours, website, social links, and timezone.
- Add tenant switcher support if multi-tenant users become common.
- Add data export and erasure status UI so compliance requests are visible after submission.

## Recommended Implementation Order

1. Add Stripe Customer Portal and billing/customer details.
2. Add object-storage uploads for brand logo/favicon/social image.
3. Add team members/invites/roles.
4. Configure production domain certificate provider and validate renewal alerting.
5. Add account audit log for sensitive account changes.
6. Add brand intelligence extraction from website/logo.
