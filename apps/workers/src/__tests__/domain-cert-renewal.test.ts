import { describe, expect, it } from "vitest";
import {
  buildDomainCertRenewalJob,
  buildRenewalIdempotencyKey,
  daysUntil,
  shouldAlertExpiringSoon,
  shouldRenewCertificate,
} from "../queues/domain-cert/renewal";

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("domain cert renewal helpers", () => {
  it("renews certificates inside the 30-day window", () => {
    expect(shouldRenewCertificate(new Date("2026-07-14T12:00:00.000Z"), NOW)).toBe(true);
    expect(shouldRenewCertificate(new Date("2026-07-20T12:00:00.000Z"), NOW)).toBe(false);
    expect(shouldRenewCertificate(null, NOW)).toBe(false);
  });

  it("alerts only inside the 14-day expiry window", () => {
    expect(shouldAlertExpiringSoon(new Date("2026-06-29T12:00:00.000Z"), NOW)).toBe(true);
    expect(shouldAlertExpiringSoon(new Date("2026-06-30T12:00:01.000Z"), NOW)).toBe(false);
  });

  it("builds stable renewal job ids per certificate expiry date", () => {
    const expiry = new Date("2026-07-01T08:30:00.000Z");

    expect(buildRenewalIdempotencyKey("domain-1", expiry)).toBe("domain-1:renew:2026-07-01");
    expect(
      buildDomainCertRenewalJob({
        domainId: "00000000-0000-4000-8000-000000000001",
        tenantId: "00000000-0000-4000-8000-000000000002",
        hostname: "cafebern.ch",
        certExpiresAt: expiry,
      }),
    ).toMatchObject({
      action: "renew",
      hostname: "cafebern.ch",
      idempotencyKey: "00000000-0000-4000-8000-000000000001:renew:2026-07-01",
    });
  });

  it("rounds days until expiry upward", () => {
    expect(daysUntil(new Date("2026-06-16T11:00:00.000Z"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-06-16T13:00:00.000Z"), NOW)).toBe(2);
  });
});
