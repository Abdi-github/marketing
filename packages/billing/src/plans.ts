// Single source of truth for plan caps — see ADR-0011.
// All other code imports from here; no cap value is hardcoded elsewhere.

export type PlanTier = "trial" | "starter" | "growth";

export type PlanCaps = {
  /** Monthly AI spend cap in USD (hard limit, enforced via Redis counter). */
  monthlyAiBudgetUsd: number;
  /** Monthly platform-managed SMS cap. 0 means SMS automation is not included. */
  monthlySmsLimit: number;
  /** Per-job spend cap in US cents (hard limit per adapter call). */
  perJobBudgetCents: number;
  /** Human-readable display name. */
  displayName: string;
};

export const PLAN_CAPS: Record<PlanTier, PlanCaps> = {
  trial: {
    monthlyAiBudgetUsd: 1.0,
    monthlySmsLimit: 0,
    perJobBudgetCents: 50,
    displayName: "Trial",
  },
  starter: {
    monthlyAiBudgetUsd: 10.0,
    monthlySmsLimit: 50,
    perJobBudgetCents: 50,
    displayName: "Starter",
  },
  growth: {
    monthlyAiBudgetUsd: 40.0,
    monthlySmsLimit: 500,
    perJobBudgetCents: 50,
    displayName: "Growth",
  },
};

/** Returns the caps for a plan tier, defaulting to trial for unknown values. */
export function getPlanCaps(plan: string): PlanCaps {
  return PLAN_CAPS[plan as PlanTier] ?? PLAN_CAPS.trial;
}

/** Redis key for the monthly AI spend counter. UTC calendar month. */
export function monthlyBudgetKey(tenantId: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `budget:monthly:${tenantId}:${yyyy}-${mm}`;
}

/** TTL in seconds for the Redis budget counter (35 days). */
export const BUDGET_KEY_TTL_SECONDS = 35 * 24 * 60 * 60;
