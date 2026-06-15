import { z } from "zod";

export const domainCertActionSchema = z.enum(["issue", "renew"]);

export const domainCertProvisionJobSchema = z.object({
  domainId: z.string().uuid(),
  tenantId: z.string().uuid(),
  hostname: z.string().min(3).max(253),
  action: domainCertActionSchema,
  idempotencyKey: z.string().min(1),
});

export const domainCertRenewalScanJobSchema = z.object({
  action: z.literal("scan-renewals"),
  idempotencyKey: z.string().min(1),
});

export const domainCertJobSchema = z.union([
  domainCertProvisionJobSchema,
  domainCertRenewalScanJobSchema,
]);

export type DomainCertAction = z.infer<typeof domainCertActionSchema>;
export type DomainCertProvisionJob = z.infer<typeof domainCertProvisionJobSchema>;
export type DomainCertRenewalScanJob = z.infer<typeof domainCertRenewalScanJobSchema>;
export type DomainCertJob = z.infer<typeof domainCertJobSchema>;

export const DOMAIN_CERT_QUEUE_NAME = "domains.cert.provision" as const;
