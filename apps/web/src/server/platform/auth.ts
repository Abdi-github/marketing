import { auth } from "@marketing/auth";
import type { PlatformRole } from "@marketing/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  canAccessPlatformSection,
  isPlatformRole,
  type PlatformSectionKey,
} from "../../lib/platform-access";

export async function getPlatformRoleFromRequest() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.platformRole;
  return {
    session,
    role: isPlatformRole(role) ? (role as PlatformRole) : null,
  };
}

export async function requirePlatformSectionAccess(section: PlatformSectionKey, locale: string) {
  const { session, role } = await getPlatformRoleFromRequest();
  if (!session || !role || !canAccessPlatformSection(role, section)) {
    redirect(`/${locale}/dashboard`);
  }
  return { session, role };
}
