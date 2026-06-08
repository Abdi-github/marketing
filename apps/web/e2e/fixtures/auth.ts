import { type Page } from "@playwright/test";
import { E2E_USERS } from "../global-setup";

export type E2EUser = (typeof E2E_USERS)[keyof typeof E2E_USERS];

/**
 * Signs in via the Better-Auth API — faster than driving the UI login form.
 * Playwright shares cookies between page.request and page navigation, so
 * subsequent page.goto() calls will carry the session cookie.
 */
export async function loginViaAPI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`[auth fixture] login failed for ${email}: ${res.status()} — ${body}`);
  }
}

export async function loginAsCafeOwner(page: Page): Promise<void> {
  await loginViaAPI(page, E2E_USERS.cafeOwner.email, E2E_USERS.cafeOwner.password);
}

export async function loginAsRestaurantOwner(page: Page): Promise<void> {
  await loginViaAPI(
    page,
    E2E_USERS.restaurantOwner.email,
    E2E_USERS.restaurantOwner.password,
  );
}

export async function loginAsSuperAdmin(page: Page): Promise<void> {
  await loginViaAPI(page, E2E_USERS.superAdmin.email, E2E_USERS.superAdmin.password);
}
