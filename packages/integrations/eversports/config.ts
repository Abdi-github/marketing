import { z } from "zod";

export const eversportsEnvSchema = z.object({
  EVERSPORTS_WEBHOOK_SECRET: z.string().min(16),
  INTEGRATION_ENCRYPTION_KEY: z.string().length(64),
});

export type EversportsEnv = z.infer<typeof eversportsEnvSchema>;

export const EVERSPORTS_BASE_URL = "https://api.eversports.com/partner/v1";
export const EVERSPORTS_SCOPES: string[] = ["schedule:read", "bookings:read"];
