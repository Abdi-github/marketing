# CRM Documentation For Restaurant Owners

This folder explains the CRM in plain English using Abdi Restaurant as the practical example.

The CRM is the part of the application where customer requests become organized staff work:

- a lead is the new opportunity,
- a contact is the saved customer profile,
- a task is the next staff action,
- the inbox is where SMS, WhatsApp, and email replies live,
- a deal is a larger opportunity such as catering or private dining,
- a segment is a saved group of customers,
- notifications tell staff what needs attention.

## Browser QA Status

Browser baseline and live reservation walkthrough completed on `2026-06-25` against
`http://localhost:3000`.

The baseline pass verified:

- the published Abdi Restaurant page renders,
- the restaurant owner can log in,
- Dashboard, Contacts, Inbox, Deals, Segments, Duplicates, and Integrations render,
- the new notification tRPC endpoints return successfully,
- screenshots were captured into `screenshots/`,
- observed results were written to `browser-qa-results.json`.

The live reservation walkthrough verified:

- customer submits the published restaurant booking form,
- the form endpoint returns `{"ok":true}`,
- a booking lead is created,
- the workflow state becomes `awaiting_confirmation`,
- a contact is matched by phone number,
- an unread `New reservation request` staff notification is created,
- the notification opens the relevant CRM contact,
- the Inbox shows automation attention items for reservations and failed messages.

Observed results were written to `live-reservation-results.json` and
`staff-walkthrough-results.json`.

Observed product notes:

- The restaurant website still shows a `Request quote` navigation label even though the main
  action is reservation-oriented. That should be corrected in the landing-page generator/editor
  before using this page as a final tenant demo.
- The staff CRM now groups similar open tasks and exposes a direct `Confirm reservation` action in
  the follow-up queue, so staff can act without hunting through the contact drawer.

## Scenario Guides

1. [CRM basics](01-crm-basics-for-restaurant-owners.md)
2. [Reservation to contact and task](02-customer-reservation-to-contact-and-task.md)
3. [Notifications and daily staff workflow](03-notifications-and-daily-staff-workflow.md)
4. [Inbox and SMS follow-up](04-inbox-sms-and-two-way-follow-up.md)
5. [Reservation statuses and task actions](05-reservation-statuses-and-task-actions.md)
6. [Deals, segments, and returning customers](06-deals-segments-and-returning-customers.md)
7. [Duplicates, consent, and customer history](07-duplicates-consent-and-customer-history.md)
8. [Automation benefits and troubleshooting](08-automation-benefits-and-troubleshooting.md)
9. [CRM UX audit results](09-crm-ux-audit-results-and-improvements.md)
10. [Full CRM browser walkthrough plan](10-full-crm-browser-walkthrough-plan.md)
11. [Manual CRM scenario playbook](11-manual-crm-scenario-playbook.md)
