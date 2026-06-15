import type {
  LandingPageComposition,
  LandingPageSection,
  LandingPageSite,
  LandingPageSiteLink,
  LandingPageSitePage,
} from "@marketing/ai-router";
import type { CSSProperties } from "react";
import {
  landingLanguageShortLabel,
  normalizeLandingLanguagePreferences,
  type LandingLanguagePreferences,
} from "../../lib/landing-language";

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function safeHref(href: string): string {
  if (/^(https?:\/\/|mailto:|tel:|#|\/|\.{1,2}\/)/i.test(href)) return href;
  return "#";
}

function hrefForLink(link: LandingPageSiteLink, basePath: string): string {
  if (link.href) return safeHref(link.href);
  const cleanBase = trimTrailingSlash(basePath);
  const anchor = link.sectionId ? `#${link.sectionId}` : "";
  if (!link.pageSlug || link.pageSlug === "home") return `${cleanBase}${anchor}`;
  return `${cleanBase}/${link.pageSlug}${anchor}`;
}

function hrefForLocale(basePath: string, activePageSlug: string, locale: string): string {
  const cleanBase = trimTrailingSlash(basePath);
  const path =
    activePageSlug && activePageSlug !== "home" ? `${cleanBase}/${activePageSlug}` : cleanBase;
  return `${path}?lang=${encodeURIComponent(locale)}`;
}

function hrefWithLocale(href: string, locale?: string | null): string {
  if (!locale) return href;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("#")) return `?lang=${encodeURIComponent(locale)}${href}`;
  const [pathAndQuery, hash] = href.split("#", 2);
  const path = pathAndQuery ?? "";
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${encodeURIComponent(locale)}${hash ? `#${hash}` : ""}`;
}

export function getSitePage(
  composition: LandingPageComposition,
  sitePageSlug?: string | null,
): LandingPageSitePage | null {
  if (!sitePageSlug) return null;
  return composition.site?.pages?.find((page) => page.slug === sitePageSlug) ?? null;
}

export function getSitePageSections(
  composition: LandingPageComposition,
  sitePageSlug?: string | null,
): LandingPageSection[] | null {
  const page = getSitePage(composition, sitePageSlug);
  if (sitePageSlug && !page) return null;
  return (page?.sections ?? composition.sections).slice().sort((a, b) => a.order - b.order);
}

export function LandingSiteNav({
  site,
  basePath,
  activePageSlug,
  brandPrimary,
  topOffset = "0px",
  languagePreferences,
  activeLocale,
}: {
  site?: LandingPageSite;
  basePath: string;
  activePageSlug?: string | null;
  brandPrimary: string;
  topOffset?: string;
  languagePreferences?: LandingLanguagePreferences | null;
  activeLocale?: string | null;
}) {
  const nav = site?.nav;
  if (!nav || nav.links.length === 0) return null;
  const navStyle = nav.style ?? "classic";
  const isBold = navStyle === "bold-pill";
  const isEditorial = navStyle === "editorial";
  const isCompact = navStyle === "compact-cta";
  const active = activePageSlug ?? "home";
  const brandLabel = nav.brandLabel ?? nav.links[0]?.label ?? "Home";
  const languages = languagePreferences
    ? normalizeLandingLanguagePreferences(languagePreferences, languagePreferences.defaultLocale)
    : null;
  const selectedLocale = activeLocale ?? languages?.defaultLocale ?? null;
  const shouldPersistLocale = !!languages && languages.locales.length > 1;

  const linkStyle: CSSProperties = {
    color: isBold ? "rgba(255, 255, 255, 0.76)" : "var(--lp-text-soft,#374151)",
    borderRadius: isBold || isCompact ? 999 : isEditorial ? 0 : 10,
    fontSize: isEditorial ? "0.82rem" : "0.9rem",
    fontWeight: isEditorial ? 800 : 700,
    letterSpacing: isEditorial ? "0.04em" : 0,
    lineHeight: 1,
    padding: isBold || isCompact ? "0.72rem 0.9rem" : "0.65rem 0.15rem",
    textDecoration: "none",
    textTransform: isEditorial ? "uppercase" : "none",
    whiteSpace: "nowrap",
  };

  return (
    <header
      style={{
        position: "sticky",
        top: topOffset,
        zIndex: 80,
        borderBottom: isBold
          ? "1px solid var(--lp-dark-border, rgba(255, 255, 255, 0.1))"
          : "1px solid var(--lp-nav-border, rgba(17, 24, 39, 0.08))",
        background: isBold
          ? "var(--lp-dark-bg, #111827)"
          : isEditorial
            ? "var(--lp-canvas, #ffffff)"
            : "var(--lp-nav-bg, rgba(255, 255, 255, 0.92))",
        backdropFilter: "blur(18px)",
      }}
    >
      <nav
        aria-label="Website navigation"
        style={{
          maxWidth: isEditorial ? 1320 : 1180,
          minHeight: isCompact ? 60 : 68,
          margin: "0 auto",
          padding: isCompact ? "0.55rem 1rem" : "0.75rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: isEditorial ? "1.25rem" : "1rem",
          flexWrap: "wrap",
        }}
      >
        <a
          href={hrefWithLocale(
            hrefForLink({ label: brandLabel, pageSlug: "home" }, basePath),
            shouldPersistLocale ? selectedLocale : null,
          )}
          style={{
            color: isBold ? "var(--lp-dark-text, #ffffff)" : "var(--lp-text,#111827)",
            fontFamily: "var(--font-heading, system-ui)",
            fontSize: isEditorial ? "1.18rem" : "1.05rem",
            fontWeight: 900,
            lineHeight: 1.1,
            textDecoration: "none",
            maxWidth: 280,
            letterSpacing: 0,
          }}
        >
          {brandLabel}
        </a>
        {nav.links.map((link, index) => {
          const linkActive = (link.pageSlug ?? "home") === active;
          return (
            <a
              key={`${link.label}-${link.pageSlug ?? link.href ?? ""}`}
              href={hrefWithLocale(
                hrefForLink(link, basePath),
                shouldPersistLocale ? selectedLocale : null,
              )}
              aria-current={linkActive ? "page" : undefined}
              style={{
                ...linkStyle,
                marginLeft: index === 0 ? "auto" : undefined,
                color: linkActive
                  ? isBold
                    ? "var(--lp-text, #111827)"
                    : "var(--lp-text,#111827)"
                  : linkStyle.color,
                background: linkActive
                  ? isBold
                    ? "var(--lp-card, #ffffff)"
                    : isCompact
                      ? "var(--lp-subtle, #f3f4f6)"
                      : undefined
                  : undefined,
                boxShadow:
                  linkActive && !isBold && !isCompact
                    ? `inset 0 -2px 0 ${brandPrimary}`
                    : undefined,
              }}
            >
              {link.label}
            </a>
          );
        })}
        {nav.cta && (
          <a
            href={hrefWithLocale(
              hrefForLink(nav.cta, basePath),
              shouldPersistLocale ? selectedLocale : null,
            )}
            style={{
              color: isBold ? "var(--lp-text,#111827)" : "var(--lp-on-primary,#fff)",
              background: isBold ? "var(--lp-card,#ffffff)" : brandPrimary,
              border: isEditorial
                ? `1px solid ${brandPrimary}`
                : isBold
                  ? "1px solid rgba(255, 255, 255, 0.2)"
                  : undefined,
              borderRadius: 999,
              fontSize: "0.88rem",
              fontWeight: 800,
              lineHeight: 1,
              padding: isCompact ? "0.75rem 0.95rem" : "0.85rem 1rem",
              textDecoration: "none",
              whiteSpace: "nowrap",
              boxShadow: isEditorial ? "none" : "0 12px 28px rgba(17, 24, 39, 0.16)",
            }}
          >
            {nav.cta.label}
          </a>
        )}
        {languages && languages.locales.length > 1 && (
          <div
            aria-label="Language switcher"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.2rem",
              border: isBold
                ? "1px solid var(--lp-dark-border, rgba(255, 255, 255, 0.1))"
                : "1px solid var(--lp-border, rgba(17, 24, 39, 0.12))",
              borderRadius: 999,
              padding: "0.18rem",
              background: isBold ? "rgba(255, 255, 255, 0.08)" : "var(--lp-card,#fff)",
            }}
          >
            {languages.locales.map((locale) => {
              const localeActive = locale === selectedLocale;
              return (
                <a
                  key={locale}
                  href={hrefForLocale(basePath, active, locale)}
                  aria-current={localeActive ? "true" : undefined}
                  style={{
                    color: localeActive
                      ? "var(--lp-on-primary,#fff)"
                      : isBold
                        ? "rgba(255, 255, 255, 0.76)"
                        : "var(--lp-text-soft,#374151)",
                    background: localeActive ? brandPrimary : "transparent",
                    borderRadius: 999,
                    fontSize: "0.72rem",
                    fontWeight: 900,
                    lineHeight: 1,
                    padding: "0.5rem 0.55rem",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {landingLanguageShortLabel(locale)}
                </a>
              );
            })}
          </div>
        )}
      </nav>
    </header>
  );
}

export function LandingSiteFooter({
  site,
  basePath,
}: {
  site?: LandingPageSite;
  basePath: string;
}) {
  const links = site?.footer?.links ?? [];

  return (
    <footer
      style={{
        background: "var(--lp-dark-bg,#0f172a)",
        color: "var(--lp-dark-muted,#cbd5e1)",
        padding: "2.5rem 1.5rem",
        fontSize: "0.85rem",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0 }}>{site?.footer?.text ?? "All rights reserved"}</p>
        {links.length > 0 && (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {links.map((link) => (
              <a
                key={`${link.label}-${link.pageSlug ?? link.href ?? ""}`}
                href={hrefForLink(link, basePath)}
                style={{
                  color: "var(--lp-dark-text,#e5e7eb)",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
