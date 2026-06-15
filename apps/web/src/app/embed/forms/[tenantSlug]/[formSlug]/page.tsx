import { db, forms, tenants } from "@marketing/db";
import type { FormSettings, FormStep } from "@marketing/ai-router";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import LeadForm from "../../../../../components/lead-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ tenantSlug: string; formSlug: string }>;
};

export default async function EmbeddedFormPage({ params }: Props) {
  const { tenantSlug, formSlug } = await params;

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) notFound();

  const [form] = await db
    .select({
      slug: forms.slug,
      schema: forms.schema,
      steps: forms.steps,
      settings: forms.settings,
      submitLabel: forms.submitLabel,
    })
    .from(forms)
    .where(and(eq(forms.tenantId, tenant.id), eq(forms.slug, formSlug), eq(forms.isActive, true)));

  if (!form) notFound();

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "1rem",
        background: "#ffffff",
        color: "#111827",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <LeadForm
          tenantSlug={tenantSlug}
          formSlug={form.slug}
          schema={form.schema as Record<string, unknown>}
          steps={form.steps as FormStep[] | undefined}
          settings={form.settings as Partial<FormSettings> | undefined}
          submitLabel={form.submitLabel ?? undefined}
        />
      </div>
    </main>
  );
}
