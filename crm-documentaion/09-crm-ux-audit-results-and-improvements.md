# 09. CRM UX Audit Results And Improvements

## Completed Improvements

- Added a dashboard notification bell for staff alerts.
- Added notification settings for in-app and SMS staff alerts.
- Added CRM contact deep links so notifications can open the relevant contact.
- Added plain-English guidance to Contacts, Inbox, Deals, Segments, and Duplicates.
- Added notifications for website leads, inbound SMS replies, and SMS delivery failures.
- Applied migration `0046_notifications.sql`.
- Restarted local web and workers after the migration.
- Added idempotent CRM task handling for lead capture so repeat reservation submissions update an existing open workflow task instead of creating endless duplicates.
- Grouped existing duplicate open tasks in the CRM follow-up queue and displayed badges such as `3 similar requests`.
- Added a selected-contact banner so staff know the customer detail panel is open on the right.

## Browser Baseline Results

Completed on `2026-06-25` against `http://localhost:3000`.

| Area                         | Result | Screenshot                                   |
| ---------------------------- | ------ | -------------------------------------------- |
| Published restaurant page    | PASS   | `screenshots/01-customer-public-page.png`    |
| Tenant login/dashboard       | PASS   | `screenshots/02-tenant-login-result.png`     |
| Contacts / follow-up queue   | PASS   | `screenshots/crm-contacts.png`               |
| Inbox                        | PASS   | `screenshots/crm-inbox.png`                  |
| Deals                        | PASS   | `screenshots/crm-deals.png`                  |
| Segments                     | PASS   | `screenshots/crm-segments.png`               |
| Duplicates                   | PASS   | `screenshots/crm-duplicates.png`             |
| Integrations / SMS readiness | PASS   | `screenshots/integrations-notifications.png` |

The first public page load was slow during cold compile, but the warmed route returned `200` and the screenshot was captured successfully.

## Remaining Browser QA

The live browser walkthrough verified:

- public website form submission,
- CRM contact creation,
- task creation,
- notification creation,
- notification-to-contact deep link,
- inbox attention visibility.

The next browser walkthrough should verify:

- inbox reply flow,
- deal creation,
- segment creation,
- duplicate review,
- mobile layout.

## UX Issues Found

- The restaurant website navigation still says `Request quote`; for this vertical it should say `Book table`, `Reserve`, or similar.
- The CRM follow-up queue previously showed repeated reservation tasks for the same contact from earlier test runs. This has been improved by grouping duplicates in the open-task queue and preventing new duplicate open workflow tasks at capture time.
- The contact detail page opens by URL, and now shows a plain selected-contact banner. A future polish should make the right-side detail panel more prominent on smaller screens.
- The Inbox correctly shows automation attention, but old WhatsApp failures make the view noisy. Add filters such as `Needs confirmation`, `Missing details`, `Failed sends`, and `Latest only`.

## Notes

The current documentation now includes local browser screenshots for both read-only page checks and a live customer reservation submission. The next pass should be the staff action scenario: confirm a reservation, create a deal for a larger request, create a segment, and test duplicate cleanup.
