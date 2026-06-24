export type SmsEntitlementReason =
  | "allowed"
  | "plan_not_included"
  | "monthly_limit_reached"
  | "provider_missing";

export interface SmsEntitlementInput {
  monthlyLimit: number;
  monthlyUsed: number;
  providerConfigured: boolean;
  demoModeAllowed?: boolean;
}

export interface SmsEntitlement {
  allowed: boolean;
  monthlyLimit: number;
  monthlyUsed: number;
  remainingMonthly: number;
  reason: SmsEntitlementReason;
  upgradeRequired: boolean;
}

export function evaluateSmsEntitlement(input: SmsEntitlementInput): SmsEntitlement {
  const monthlyLimit = Math.max(0, input.monthlyLimit);
  const monthlyUsed = Math.max(0, input.monthlyUsed);
  const remainingMonthly = Math.max(0, monthlyLimit - monthlyUsed);

  if (!input.providerConfigured) {
    return {
      allowed: false,
      monthlyLimit,
      monthlyUsed,
      remainingMonthly,
      reason: "provider_missing",
      upgradeRequired: false,
    };
  }

  if (monthlyLimit <= 0 && !input.demoModeAllowed) {
    return {
      allowed: false,
      monthlyLimit,
      monthlyUsed,
      remainingMonthly,
      reason: "plan_not_included",
      upgradeRequired: true,
    };
  }

  if (remainingMonthly <= 0 && !input.demoModeAllowed) {
    return {
      allowed: false,
      monthlyLimit,
      monthlyUsed,
      remainingMonthly,
      reason: "monthly_limit_reached",
      upgradeRequired: true,
    };
  }

  return {
    allowed: true,
    monthlyLimit,
    monthlyUsed,
    remainingMonthly,
    reason: "allowed",
    upgradeRequired: false,
  };
}
