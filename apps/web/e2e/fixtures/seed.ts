let counter = 0;

/**
 * Generates a unique test email on each call so specs that create new accounts
 * don't collide with each other or with the seeded E2E_USERS.
 */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${++counter}@e2e.test`;
}

/**
 * Calls the tRPC auth.signup mutation via HTTP, then signs in with Better-Auth.
 * Returns the email + password used so the caller can drive authenticated flows.
 */
export async function signupViaAPI(
  request: import("@playwright/test").APIRequestContext,
  overrides: Partial<{ name: string; email: string; password: string; businessName: string }> = {},
): Promise<{ email: string; password: string }> {
  const email = overrides.email ?? uniqueEmail("user");
  const password = overrides.password ?? "E2eTestPass1!";

  // tRPC v11 with httpBatchLink and NO transformer: send raw input directly.
  const res = await request.post("/api/trpc/auth.signup", {
    data: {
      name: overrides.name ?? "E2E User",
      email,
      password,
      businessName: overrides.businessName ?? "E2E Business",
    },
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok()) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`[seed fixture] signup failed: ${res.status()} — ${body}`);
  }

  return { email, password };
}
