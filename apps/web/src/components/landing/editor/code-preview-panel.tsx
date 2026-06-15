"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  LandingPageComposition,
  LandingPageSection,
  LandingPageSiteLink,
} from "@marketing/ai-router";

type CodeTab = "map" | "tsx" | "json";

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  about: "About",
  menu_preview: "MenuPreview",
  offer: "Offer",
  gallery: "Gallery",
  testimonials: "Testimonials",
  faq: "FAQ",
  contact: "Contact",
  lead_form: "LeadForm",
  whatsapp_cta: "WhatsAppCta",
};

function cleanText(value: string | undefined, max = 180): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}...`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function routeForPage(basePath: string, slug: string): string {
  const cleanBase = basePath.replace(/\/+$/, "");
  return slug === "home" ? cleanBase : `${cleanBase}/${slug}`;
}

function allPages(composition: LandingPageComposition) {
  return [
    {
      slug: "home",
      title: composition.title,
      description: undefined,
      sections: composition.sections,
    },
    ...(composition.site?.pages ?? []),
  ];
}

function lineForSection(section: LandingPageSection): string {
  const component = `${SECTION_LABELS[section.type] ?? "Section"}Section`;
  const props = [
    `type=${quote(section.type)}`,
    section.variant ? `variant=${quote(section.variant)}` : null,
    section.tone ? `tone=${quote(section.tone)}` : null,
    `heading=${quote(cleanText(section.heading, 90) ?? "")}`,
    section.body ? `body=${quote(cleanText(section.body, 130) ?? "")}` : null,
  ].filter(Boolean);

  return `      <${component} ${props.join(" ")} />`;
}

function navLinkSummary(
  link: LandingPageSiteLink,
  basePath: string,
): { label: string; href: string } {
  if (link.href) return { label: link.label, href: link.href };
  return { label: link.label, href: routeForPage(basePath, link.pageSlug ?? "home") };
}

function buildTsxPreview(composition: LandingPageComposition, basePath: string): string {
  const navLinks = (composition.site?.nav?.links ?? []).map((link) =>
    navLinkSummary(link, basePath),
  );
  const pages = allPages(composition);

  const pageBlocks = pages.flatMap((page) => [
    `    <Page slug=${quote(page.slug)} title=${quote(page.title)} route=${quote(routeForPage(basePath, page.slug))}>`,
    ...page.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(lineForSection),
    "    </Page>",
  ]);

  return [
    "// Read-only preview generated from the safe landing-page composition.",
    "// Runtime rendering still uses registered SectionBlock components and approved variants.",
    "",
    `const navLinks = ${JSON.stringify(navLinks, null, 2)};`,
    "",
    "export default function GeneratedWebsite() {",
    "  return (",
    `    <WebsiteShell brand=${quote(composition.site?.nav?.brandLabel ?? composition.title)} navLinks={navLinks}>`,
    ...pageBlocks,
    "    </WebsiteShell>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildJsonPreview(composition: LandingPageComposition): string {
  return JSON.stringify(
    {
      title: composition.title,
      locale: composition.locale,
      site: composition.site ?? null,
      sections: composition.sections,
    },
    null,
    2,
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
        active ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function CodePreviewPanel({
  composition,
  publicBasePath,
}: {
  composition: LandingPageComposition;
  publicBasePath: string;
}) {
  const [tab, setTab] = useState<CodeTab>("map");
  const [copied, setCopied] = useState(false);
  const pages = useMemo(() => allPages(composition), [composition]);
  const tsxPreview = useMemo(
    () => buildTsxPreview(composition, publicBasePath),
    [composition, publicBasePath],
  );
  const jsonPreview = useMemo(() => buildJsonPreview(composition), [composition]);
  const activeCode = tab === "json" ? jsonPreview : tsxPreview;

  async function copyActive() {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-950">Generated website</h2>
            <p className="mt-1 text-xs text-gray-500">
              {pages.length} pages / {composition.site?.nav?.links.length ?? 0} nav links /{" "}
              {composition.sections.length} home sections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
              <TabButton active={tab === "map"} onClick={() => setTab("map")}>
                Map
              </TabButton>
              <TabButton active={tab === "tsx"} onClick={() => setTab("tsx")}>
                TSX
              </TabButton>
              <TabButton active={tab === "json"} onClick={() => setTab("json")}>
                JSON
              </TabButton>
            </div>
            {tab !== "map" && (
              <button
                type="button"
                onClick={copyActive}
                className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>

        {tab === "map" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {pages.map((page) => (
              <section
                key={page.slug}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {page.slug}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-gray-950">{page.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {routeForPage(publicBasePath, page.slug)}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                    {page.sections.length} sections
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {page.sections
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((section, index) => (
                      <span
                        key={`${page.slug}-${section.type}-${index}`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
                      >
                        <span className="font-semibold">
                          {SECTION_LABELS[section.type] ?? section.type}
                        </span>
                        {section.variant && (
                          <span className="text-gray-400">{section.variant}</span>
                        )}
                      </span>
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <pre className="max-h-[calc(100vh-13rem)] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-6 text-gray-100 shadow-2xl">
            <code>{activeCode}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
