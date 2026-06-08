// Stripe webhook receiver.
// Contract: return 200 fast (< 3 s); all side-effects are async/queued.
// Idempotency: INSERT INTO webhook_events (provider, event_id) ON CONFLICT DO NOTHING.
//   If the row already exists the handler returns 200 without re-processing.
// See ADR-0011, docs/WORKFLOWS.md §Billing.
import { db } from "@marketing/db";
import {
  webhookEvents,
  subscriptions,
  stripeCustomers,
  invoices,
  tenants,
} from "@marketing/db";
import { constructStripeEvent } from "@marketing/billing";
import { env, logger, TENANT_LIFECYCLE_EVENTS } from "@marketing/shared";
import { eq, isNull, and } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("[webhook/stripe] STRIPE_WEBHOOK_SECRET not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err: String(err) }, "[webhook/stripe] signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  // ─── Idempotency check ───────────────────────────────────────────────────
  // Resolve tenant_id from metadata when available (may be null for some events).
  const tenantId = extractTenantId(event);

  const inserted = await db
    .insert(webhookEvents)
    .values({
      tenantId: tenantId ?? null,
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.eventId],
    })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    // Already processed — safe to return 200.
    logger.info({ eventId: event.id, type: event.type }, "[webhook/stripe] duplicate — skipping");
    return new Response("ok", { status: 200 });
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────
  try {
    await dispatch(event);
    // Mark as processed.
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.eventId, event.id));
  } catch (err) {
    logger.error({ err: String(err), eventId: event.id, type: event.type }, "[webhook/stripe] handler error");
    // Return 500 so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// ─── Event dispatcher ────────────────────────────────────────────────────────

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    default:
      // Unhandled events are logged but not errors.
      logger.info({ type: event.type }, "[webhook/stripe] unhandled event type");
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const tenantId = session.metadata?.["tenant_id"];
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!tenantId || !stripeCustomerId) {
    logger.warn({ sessionId: session.id }, "[webhook/stripe] checkout.session.completed missing tenant_id or customer");
    return;
  }

  // Upsert stripe_customers so subsequent subscription events can resolve tenant.
  await db
    .insert(stripeCustomers)
    .values({ tenantId, stripeCustomerId })
    .onConflictDoNothing({ target: stripeCustomers.tenantId });

  logger.info({ tenantId, stripeCustomerId }, "[webhook/stripe] checkout completed — customer linked");
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
  const tenantId = await resolveTenantIdFromCustomer(
    typeof sub.customer === "string" ? sub.customer : sub.customer.id,
  );
  if (!tenantId) {
    logger.warn({ subscriptionId: sub.id }, "[webhook/stripe] subscription event — no tenant found for customer");
    return;
  }

  const plan = resolvePlanFromSubscription(sub);

  await db
    .insert(subscriptions)
    .values({
      tenantId,
      stripeSubscriptionId: sub.id,
      plan,
      status: sub.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete",
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        plan,
        status: sub.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete",
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        updatedAt: new Date(),
      },
    });

  // Flip tenant.plan to the new tier.
  await db.update(tenants).set({ plan, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

  // Emit tenant.plan_changed for ai-router cost-cap cache refresh (ADR-0007).
  const { outbox } = await import("@marketing/db");
  await db.insert(outbox).values({
    tenantId,
    type: "tenant.plan_changed",
    payload: { tenantId, plan, stripeSubscriptionId: sub.id },
  });

  // Emit tenant.first_paid_at once when the tenant activates a non-trial plan (ADR-0016).
  if (plan !== "trial" && sub.status === "active") {
    const now = new Date();
    const updated = await db
      .update(tenants)
      .set({ firstPaidAt: now, updatedAt: now })
      .where(and(eq(tenants.id, tenantId), isNull(tenants.firstPaidAt)))
      .returning({ id: tenants.id });

    if (updated.length > 0) {
      await db.insert(outbox).values({
        tenantId,
        type: TENANT_LIFECYCLE_EVENTS.FIRST_PAID_AT,
        payload: {
          tenantId,
          firstPaidAt: now.toISOString(),
          plan,
          stripeSubscriptionId: sub.id,
        },
      });
    }
  }

  logger.info({ tenantId, plan, status: sub.status }, "[webhook/stripe] subscription upserted");
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const tenantId = await resolveTenantIdFromCustomer(
    typeof sub.customer === "string" ? sub.customer : sub.customer.id,
  );
  if (!tenantId) return;

  // Resolve plan before we revert to "trial" — needed for churned event payload.
  const [subRow] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
  const planAtChurn = subRow?.plan ?? "starter";

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  // Revert tenant to trial plan on cancellation.
  const now = new Date();
  await db
    .update(tenants)
    .set({ plan: "trial", churnedAt: now, updatedAt: now })
    .where(eq(tenants.id, tenantId));

  const { outbox } = await import("@marketing/db");
  await db.insert(outbox).values({
    tenantId,
    type: "tenant.plan_changed",
    payload: { tenantId, plan: "trial", stripeSubscriptionId: sub.id },
  });

  // Emit tenant.churned lifecycle event (ADR-0016 §D3).
  await db.insert(outbox).values({
    tenantId,
    type: TENANT_LIFECYCLE_EVENTS.CHURNED,
    payload: {
      tenantId,
      churnedAt: now.toISOString(),
      planAtChurn,
      stripeSubscriptionId: sub.id,
    },
  });

  logger.info({ tenantId, planAtChurn }, "[webhook/stripe] subscription canceled — tenant churned");
}

async function handleInvoicePaid(inv: Stripe.Invoice): Promise<void> {
  const tenantId = await resolveTenantIdFromCustomer(
    typeof inv.customer === "string" ? inv.customer : (inv.customer as Stripe.Customer)?.id,
  );
  if (!tenantId) return;

  await db
    .insert(invoices)
    .values({
      tenantId,
      stripeInvoiceId: inv.id!,
      amountCents: inv.amount_paid,
      currency: inv.currency.toLowerCase(),
      status: "paid",
      pdfUrl: inv.invoice_pdf ?? null,
      dueAt: inv.due_date ? new Date(inv.due_date * 1000) : null,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : new Date(),
    })
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        status: "paid",
        pdfUrl: inv.invoice_pdf ?? null,
        paidAt: new Date(),
      },
    });
}

async function handleInvoicePaymentFailed(inv: Stripe.Invoice): Promise<void> {
  const tenantId = await resolveTenantIdFromCustomer(
    typeof inv.customer === "string" ? inv.customer : (inv.customer as Stripe.Customer)?.id,
  );
  if (!tenantId) return;

  await db
    .insert(invoices)
    .values({
      tenantId,
      stripeInvoiceId: inv.id!,
      amountCents: inv.amount_due,
      currency: inv.currency.toLowerCase(),
      status: "payment_failed",
      pdfUrl: null,
      dueAt: inv.due_date ? new Date(inv.due_date * 1000) : null,
      paidAt: null,
    })
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: { status: "payment_failed" },
    });

  logger.warn({ tenantId, invoiceId: inv.id }, "[webhook/stripe] invoice payment failed");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTenantId(event: Stripe.Event): string | null {
  const obj = event.data.object as { metadata?: { tenant_id?: string } };
  return obj.metadata?.["tenant_id"] ?? null;
}

async function resolveTenantIdFromCustomer(
  stripeCustomerId: string | undefined,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  const [row] = await db
    .select({ tenantId: stripeCustomers.tenantId })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId));
  return row?.tenantId ?? null;
}

/** Maps Stripe price IDs to internal plan names via env vars (ADR-0011). */
function resolvePlanFromSubscription(sub: Stripe.Subscription): string {
  const priceId = sub.items.data[0]?.price?.id ?? "";
  if (priceId === env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === env.STRIPE_GROWTH_PRICE_ID) return "growth";
  // Unknown price → default to starter (never downgrade to trial from webhook).
  logger.warn({ priceId }, "[webhook/stripe] unknown price ID — defaulting to starter");
  return "starter";
}
