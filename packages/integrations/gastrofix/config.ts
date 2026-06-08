import { z } from "zod";

export const gastrofixEnvSchema = z.object({
  GASTROFIX_WEBHOOK_SECRET: z.string().min(16),
  INTEGRATION_ENCRYPTION_KEY: z.string().length(64),
});

export type GastrofixEnv = z.infer<typeof gastrofixEnvSchema>;

export const GASTROFIX_BASE_URL = "https://api.gastrofix.com/v1";
export const GASTROFIX_SCOPES: string[] = ["reservations:read", "menu:read"];
