import Stripe from "stripe";
import { env } from "@marketing/shared";

let _client: Stripe | null = null;

/** Returns a lazily-initialised Stripe client. Throws if STRIPE_SECRET_KEY is unset. */
export function getStripeClient(): Stripe {
  if (_client) return _client;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set — add it to your environment.");
  _client = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  return _client;
}

// ─── Customer helpers ─────────────────────────────────────────────────────────

export async function createStripeCustomer(params: {
  email: string;
  name: string;
  tenantId: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: { tenant_id: params.tenantId },
  });
  return customer.id;
}

// ─── Checkout helpers ─────────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  stripeCustomerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  tenantId: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    customer: params.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { tenant_id: params.tenantId },
    currency: "chf",
    subscription_data: {
      metadata: { tenant_id: params.tenantId },
    },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

// ─── Subscription helpers ─────────────────────────────────────────────────────

export type SubscriptionInfo = {
  id: string;
  status: string;
  plan: string | null;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
};

export async function getSubscriptionStatus(
  stripeSubscriptionId: string,
): Promise<SubscriptionInfo> {
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  return {
    id: sub.id,
    status: sub.status,
    plan: sub.items.data[0]?.price?.id ?? null,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
  };
}

export async function cancelStripeSubscription(
  stripeSubscriptionId: string,
): Promise<void> {
  const stripe = getStripeClient();
  await stripe.subscriptions.cancel(stripeSubscriptionId);
}

// ─── Webhook verification ─────────────────────────────────────────────────────

export function constructStripeEvent(
  rawBody: string,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );
}
