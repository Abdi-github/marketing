// Server component — fetches business profile during SSR. No loading state, no client round-trip.
// Form submission handled by SetupForm client component.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, businessProfiles } from "@marketing/db";
import { eq } from "drizzle-orm";
import { SetupForm } from "./_setup-form";

type Props = { params: Promise<{ locale: string }> };

export default async function SetupPage({ params }: Props) {
  const { locale } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, tenantCtx.tenantId));

  const initialProfile = profile
    ? {
        businessName: profile.businessName,
        vertical: profile.vertical,
        locale: profile.locale as "de-CH" | "fr-CH" | "it-CH" | "en",
        addressCity: profile.addressCity ?? "",
      }
    : null;

  return <SetupForm initialProfile={initialProfile} locale={locale} />;
}
