import type { DomainCertProvisionJob } from "@marketing/ai-router";

export const EXPIRING_SOON_ALERT_DAYS = 14;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function daysUntil(target: Date, now = new Date()): number {
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function shouldRenewCertificate(
  certExpiresAt: Date | null,
  now = new Date(),
  renewalWindowDays = 30,
): boolean {
  if (!certExpiresAt) return false;
  return certExpiresAt.getTime() <= addDays(now, renewalWindowDays).getTime();
}

export function shouldAlertExpiringSoon(certExpiresAt: Date | null, now = new Date()): boolean {
  if (!certExpiresAt) return false;
  return certExpiresAt.getTime() <= addDays(now, EXPIRING_SOON_ALERT_DAYS).getTime();
}

export function renewalWindowKey(certExpiresAt: Date): string {
  return certExpiresAt.toISOString().slice(0, 10);
}

export function buildRenewalIdempotencyKey(domainId: string, certExpiresAt: Date): string {
  return `${domainId}:renew:${renewalWindowKey(certExpiresAt)}`;
}

export function buildDomainCertRenewalJob(input: {
  domainId: string;
  tenantId: string;
  hostname: string;
  certExpiresAt: Date;
}): DomainCertProvisionJob {
  return {
    domainId: input.domainId,
    tenantId: input.tenantId,
    hostname: input.hostname,
    action: "renew",
    idempotencyKey: buildRenewalIdempotencyKey(input.domainId, input.certExpiresAt),
  };
}
