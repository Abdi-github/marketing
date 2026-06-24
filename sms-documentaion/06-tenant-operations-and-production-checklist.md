# Tenant Operations and Production Checklist

## Daily tenant workflow

1. Open `Integrations` and check SMS is `Ready`.
2. Confirm the business phone is verified.
3. Check monthly SMS usage and remaining quota.
4. Open `CRM -> Inbox` and filter to SMS.
5. Review failed or undelivered messages.
6. Open the related contact and reservation task.
7. Confirm, decline, or ask for missing details.
8. Review active sequence enrollments.
9. Pause an enrollment when human follow-up is more appropriate.

## Configuration choices

### Platform-managed SMS

This is the normal production model. The SaaS owns the Twilio sender and tenants do not enter
Twilio credentials. Tenants only verify their business phone number and use SMS within their plan
limits.

Default monthly SMS limits:

| Plan    | Monthly SMS limit | Notes                                         |
| ------- | ----------------- | --------------------------------------------- |
| Trial   | 0                 | No real SMS except the configured demo tenant |
| Starter | 50                | Suitable for basic reservation follow-up      |
| Growth  | 500               | Suitable for higher-volume lead follow-up     |

The verified tenant phone is used as the business contact identity in public pages, CRM, and trust
display. Outbound SMS still comes from the platform Twilio sender unless a future enterprise setup
hosts or approves the tenant number in Twilio.

### Platform demo mode

Use for one explicit demonstration tenant only when the tenant is on a plan without real SMS:

```text
SMS_PROVIDER=twilio
SMS_TEST_MODE_ENABLED=true
SMS_TEST_TENANT_SLUG=<demo-tenant-slug>
```

The Account SID, auth token, and sender number remain secret environment variables.

### Tenant-owned Twilio override

Tenant-owned Twilio credentials are not part of the normal tenant journey. They remain an internal
or enterprise escape hatch only. If enabled by platform staff, an admin can save:

- Account SID
- auth token
- sender phone number

These credentials are encrypted and take priority over platform-managed credentials, but the normal
Integrations UI should keep this hidden from ordinary tenants.

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
- [ ] Apply `0045_platform_managed_sms.sql` to the production database.
- [ ] Add platform SMS and Twilio environment variables to Vercel.
- [ ] Add the same worker-required values to Fly.
- [ ] Confirm both callback URLs no longer return `404`.
- [ ] Confirm `SMS_TEST_TENANT_SLUG` matches the intended demo tenant exactly.
- [ ] Confirm the Twilio trial recipient is verified.
- [ ] Confirm the Twilio sender supports SMS to Switzerland.
- [ ] Confirm tenant plan limits show correctly in Integrations.
- [ ] Verify the tenant business phone using the OTP flow.
- [ ] Run one diagnostic SMS.
- [ ] Submit one complete reservation.
- [ ] Reply from the verified phone.
- [ ] Verify Inbox, CRM facts, task update, and delivery states.
- [ ] Test STOP and confirm suppression.
- [ ] Keep tenant-owned Twilio credentials hidden unless enterprise override is intentionally enabled.

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
