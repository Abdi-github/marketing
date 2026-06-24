# Tenant Operations and Production Checklist

## Daily tenant workflow

1. Open `Integrations` and check SMS is `Ready`.
2. Open `CRM -> Inbox` and filter to SMS.
3. Review failed or undelivered messages.
4. Open the related contact and reservation task.
5. Confirm, decline, or ask for missing details.
6. Review active sequence enrollments.
7. Pause an enrollment when human follow-up is more appropriate.

## Configuration choices

### Platform demo mode

Use for one explicit demonstration tenant only:

```text
SMS_PROVIDER=twilio
SMS_TEST_MODE_ENABLED=true
SMS_TEST_TENANT_SLUG=<demo-tenant-slug>
```

The Account SID, auth token, and sender number remain secret environment variables.

### Tenant-owned Twilio

An admin can open advanced SMS details and save:

- Account SID
- auth token
- sender phone number

These credentials are encrypted and take priority over platform demo credentials.

## Twilio webhook setup

Configure Twilio with:

```text
Inbound:
https://marketing-web-pied-nine.vercel.app/api/integrations/twilio/sms/inbound

Status callback:
https://marketing-web-pied-nine.vercel.app/api/integrations/twilio/sms/status
```

The exact URL matters because it is part of Twilio signature validation.

## Deployment checklist

- [ ] Commit and push the SMS implementation.
- [ ] Wait for Vercel deployment to finish.
- [ ] Deploy/restart Fly workers with the same database and Redis.
- [ ] Add SMS and Twilio environment variables to Vercel.
- [ ] Add the same worker-required values to Fly.
- [ ] Confirm both callback URLs no longer return `404`.
- [ ] Confirm `SMS_TEST_TENANT_SLUG` matches the intended demo tenant exactly.
- [ ] Confirm the Twilio trial recipient is verified.
- [ ] Confirm the Twilio sender supports SMS to Switzerland.
- [ ] Run one diagnostic SMS.
- [ ] Submit one complete reservation.
- [ ] Reply from the verified phone.
- [ ] Verify Inbox, CRM facts, task update, and delivery states.
- [ ] Test STOP and confirm suppression.
- [ ] Remove or restrict platform demo mode before onboarding multiple real tenants.

## Controlled real-SMS plan

Maximum planned external messages: six, all to the verified test recipient.

| Send | Purpose                                    |
| ---- | ------------------------------------------ |
| 1    | Provider diagnostic                        |
| 2    | Complete reservation acknowledgement       |
| 3    | Staff-approved reservation confirmation    |
| 4    | Missing-details acknowledgement or request |
| 5    | Reviewed sequence step                     |
| 6    | Optional HELP/STOP recovery verification   |

Each real send requires confirmation immediately before execution. Customer replies from the phone
are inbound messages and should also be recorded in the test report.

## Release gate

Do not run the six-message test until the Vercel webhook routes are deployed. The local architecture
is ready, but delivery callbacks and inbound replies cannot reach localhost through the production
Twilio configuration.

Observed on 2026-06-24:

- `http://localhost:3000/api/integrations/twilio/sms/status` returns `400 Missing MessageSid` for an invalid Twilio-style probe, which confirms the local route is live and handling bad input safely.
- `http://localhost:3000/api/integrations/twilio/sms/inbound` returns `400 Missing MessageSid` for the same invalid probe.
- `https://marketing-web-pied-nine.vercel.app/api/integrations/twilio/sms/status` still returns `404`, so the deployed app has not picked up this route yet.
