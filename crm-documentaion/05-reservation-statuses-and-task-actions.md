# 05. Reservation Statuses And Task Actions

## Business Goal

Reservation requests should move through clear states so staff know what is pending.

## Status Meaning

- **New:** request was just received.
- **Contacted:** staff or automation has replied.
- **Missing details:** date, time, or party size is missing.
- **Awaiting confirmation:** staff must decide if the booking is accepted.
- **Confirmed:** staff has confirmed the reservation.
- **Declined or cancelled:** request will not proceed.

## Task Actions

- **Complete:** staff finished the work.
- **Snooze:** remind staff later.
- **Priority:** mark urgent work.
- **Reply:** continue the conversation.
- **Create deal:** use for high-value private dining or catering.

## Screenshots

- `screenshots/crm-contacts.png` - Contacts workspace and follow-up queue.

## Observed Status

The CRM page rendered and the follow-up queue is visible. The next live pass should submit a reservation request and then capture the reservation-specific task/status controls.
