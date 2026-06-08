import { z } from "zod";

export const lightspeedEnvSchema = z.object({
  INTEGRATION_ENCRYPTION_KEY: z.string().length(64),
});

export type LightspeedEnv = z.infer<typeof lightspeedEnvSchema>;

/** Lightspeed Restaurant (iKentoo) CH API base. */
export const LIGHTSPEED_BASE_URL = "https://api.ikentoo.com/api/1.0";
export const LIGHTSPEED_SCOPES: string[] = ["catalog:read", "transactions:read"];
