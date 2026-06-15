import { z } from "zod";

export const integrationSyncJobSchema = z.object({
  tenantId: z.string().uuid(),
  connectionId: z.string().uuid(),
  syncRunId: z.string().uuid(),
  provider: z.enum([
    "gastrofix",
    "lightspeed_ch",
    "eversports",
    "bexio",
    "meta",
    "google_business",
    "resend",
  ]),
  source: z.enum(["manual", "scheduled", "webhook", "system"]).default("manual"),
});

export type IntegrationSyncJob = z.infer<typeof integrationSyncJobSchema>;

export const INTEGRATION_SYNC_QUEUE_NAME = "integrations.sync" as const;
