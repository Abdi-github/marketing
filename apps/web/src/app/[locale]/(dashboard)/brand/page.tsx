// Server component — fetches brand settings during SSR. No loading state, no client waterfall.
// Save mutation is handled by BrandForm client component.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, brandAssets } from "@marketing/db";
import { eq } from "drizzle-orm";
import { BrandForm } from "./_brand-form";

type Props = { params: Promise<{ locale: string }> };

export default async function BrandKitPage({ params }: Props) {
  const { locale } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const [brand] = await db
    .select()
    .from(brandAssets)
    .where(eq(brandAssets.tenantId, tenantCtx.tenantId));

  const initialBrand = brand
    ? {
        logoUrl: brand.logoUrl ?? "",
        faviconUrl: brand.faviconUrl ?? "",
        socialPreviewUrl: brand.socialPreviewUrl ?? "",
        colorPrimary: brand.colorPrimary,
        colorSecondary: brand.colorSecondary,
        fontHeading: brand.fontHeading,
        fontBody: brand.fontBody,
        voiceTone: brand.voiceTone ?? "",
      }
    : null;

  return <BrandForm initialBrand={initialBrand} />;
}
