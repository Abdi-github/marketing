import type { PlatformRole } from "@marketing/db";

export const PLATFORM_SECTION_KEYS = [
  "overview",
  "tenants",
  "users",
  "billing",
  "aiJobs",
  "integrations",
  "domains",
  "support",
  "audit",
  "health",
] as const;

export type PlatformSectionKey = (typeof PLATFORM_SECTION_KEYS)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super admin",
  support_admin: "Support admin",
  operations_admin: "Operations admin",
  finance_admin: "Finance admin",
};

export const PLATFORM_SECTION_ACCESS: Record<PlatformSectionKey, PlatformRole[]> = {
  overview: ["super_admin", "support_admin", "operations_admin", "finance_admin"],
  tenants: ["super_admin", "support_admin", "operations_admin"],
  users: ["super_admin"],
  billing: ["super_admin", "finance_admin"],
  aiJobs: ["super_admin", "support_admin", "operations_admin"],
  integrations: ["super_admin", "support_admin", "operations_admin"],
  domains: ["super_admin", "support_admin", "operations_admin"],
  support: ["super_admin", "support_admin"],
  audit: ["super_admin", "support_admin", "operations_admin", "finance_admin"],
  health: ["super_admin", "operations_admin"],
};

export function isPlatformRole(value: string | null | undefined): value is PlatformRole {
  return (
    value === "super_admin" ||
    value === "support_admin" ||
    value === "operations_admin" ||
    value === "finance_admin"
  );
}

export function canAccessPlatformSection(
  role: PlatformRole | null | undefined,
  section: PlatformSectionKey,
) {
  return Boolean(role && PLATFORM_SECTION_ACCESS[section].includes(role));
}

export const PLATFORM_NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  section: PlatformSectionKey;
  exactMatch?: boolean;
}> = [
  {
    href: "/admins",
    label: "Overview",
    section: "overview",
    exactMatch: true,
    icon: "M3 13h8V3H3v10zm10 8h8V3h-8v18zm-10 0h8v-6H3v6z",
  },
  {
    href: "/admins/tenants",
    label: "Tenants",
    section: "tenants",
    icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  {
    href: "/admins/users",
    label: "Users",
    section: "users",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    href: "/admins/billing",
    label: "Billing & Usage",
    section: "billing",
    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  },
  {
    href: "/admins/ai-jobs",
    label: "AI Jobs",
    section: "aiJobs",
    icon: "M9.75 3a.75.75 0 01.75.75V5h3V3.75a.75.75 0 011.5 0V5h.75A2.25 2.25 0 0118 7.25v7.5A2.25 2.25 0 0115.75 17H15v1.25a.75.75 0 01-1.5 0V17h-3v1.25a.75.75 0 01-1.5 0V17h-.75A2.25 2.25 0 016 14.75v-7.5A2.25 2.25 0 018.25 5H9V3.75A.75.75 0 019.75 3zM8.25 6.5a.75.75 0 00-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 00.75-.75v-7.5a.75.75 0 00-.75-.75h-7.5z",
  },
  {
    href: "/admins/integrations",
    label: "Integrations",
    section: "integrations",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  },
  {
    href: "/admins/domains",
    label: "Domains",
    section: "domains",
    icon: "M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 0a3 3 0 100 6 3 3 0 000-6z",
  },
  {
    href: "/admins/support",
    label: "Support Sessions",
    section: "support",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    href: "/admins/audit",
    label: "Audit & Compliance",
    section: "audit",
    icon: "M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z",
  },
  {
    href: "/admins/health",
    label: "System Health",
    section: "health",
    icon: "M3 13h4l3 6 4-12 3 6h4",
  },
];

export function getPlatformSidebarGroups(locale: string, role: PlatformRole) {
  const visibleItems = PLATFORM_NAV_ITEMS.filter((item) =>
    canAccessPlatformSection(role, item.section),
  ).map((item) => ({
    href: `/${locale}${item.href}`,
    label: item.label,
    icon: item.icon,
    exactMatch: item.exactMatch,
    section: item.section,
  }));

  const pick = (...sections: PlatformSectionKey[]) =>
    visibleItems.filter((item) => sections.includes(item.section));

  return [
    { label: "Overview", items: pick("overview") },
    { label: "Tenant Operations", items: pick("tenants", "support", "users") },
    { label: "Revenue & AI", items: pick("billing", "aiJobs") },
    { label: "Publishing & Channels", items: pick("integrations", "domains", "health") },
    { label: "Governance", items: pick("audit") },
  ].filter((group) => group.items.length > 0);
}
