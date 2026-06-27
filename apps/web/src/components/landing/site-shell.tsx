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
import { buildTrackedCtaProps } from "./tracking";
import { resolveLandingSiteLinkHref } from "./cta-targets";

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function hrefForLink(link: LandingPageSiteLink, basePath: string): string {
  return resolveLandingSiteLinkHref(link, basePath);
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

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function sitePages(site?: LandingPageSite): LandingPageSitePage[] {
  return asArray(site?.pages);
}

function navLinks(site?: LandingPageSite): LandingPageSiteLink[] {
  return asArray(site?.nav?.links);
}

function footerLinks(site?: LandingPageSite): LandingPageSiteLink[] {
  return asArray(site?.footer?.links);
}

export function getSitePage(
  composition: LandingPageComposition,
  sitePageSlug?: string | null,
): LandingPageSitePage | null {
  if (!sitePageSlug) return null;
  return sitePages(composition.site).find((page) => page.slug === sitePageSlug) ?? null;
}

export function getSitePageSections(
  composition: LandingPageComposition,
  sitePageSlug?: string | null,
): LandingPageSection[] | null {
  const page = getSitePage(composition, sitePageSlug);
  if (sitePageSlug && !page) return null;
  const sections = asArray(page?.sections ?? composition.sections);
  return sections.slice().sort((a, b) => a.order - b.order);
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
  const links = navLinks(site);
  if (!nav || links.length === 0) return null;
  const navStyle = nav.style ?? "classic";
  const isBold = navStyle === "bold-pill";
  const isEditorial = navStyle === "editorial";
  const isCompact = navStyle === "compact-cta";
  const active = activePageSlug ?? "home";
  const brandLabel = nav.brandLabel ?? links[0]?.label ?? "Home";
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
  const activeLinkStyle = (link: LandingPageSiteLink, index?: number): CSSProperties => {
    const linkActive = (link.pageSlug ?? "home") === active;
    return {
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
      boxShadow: linkActive && !isBold && !isCompact ? `inset 0 -2px 0 ${brandPrimary}` : undefined,
    };
  };
  const mobileLinkStyle = (link: LandingPageSiteLink): CSSProperties => ({
    ...activeLinkStyle(link),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    color:
      (link.pageSlug ?? "home") === active
        ? isBold
          ? "var(--lp-text,#111827)"
          : "var(--lp-text,#111827)"
        : isBold
          ? "rgba(255,255,255,0.84)"
          : "var(--lp-text-soft,#374151)",
    fontSize: "0.96rem",
    fontWeight: 760,
    lineHeight: 1.2,
    marginLeft: undefined,
    padding: "0.95rem 1rem",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  });
  const ctaStyle: CSSProperties = {
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
  };
  const languageSwitcherStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    border: isBold
      ? "1px solid var(--lp-dark-border, rgba(255, 255, 255, 0.1))"
      : "1px solid var(--lp-border, rgba(17, 24, 39, 0.12))",
    borderRadius: 999,
    padding: "0.18rem",
    background: isBold ? "rgba(255, 255, 255, 0.08)" : "var(--lp-card,#fff)",
  };
  const localeLinkStyle = (locale: string): CSSProperties => {
    const localeActive = locale === selectedLocale;
    return {
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
    };
  };

  return (
    <header
      className={`lp-site-nav lp-site-nav--${navStyle}`}
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
      <style>{`
        .lp-themed-page {
          overflow-x: clip;
        }
        .lp-themed-page h1,
        .lp-themed-page h2,
        .lp-themed-page h3,
        .lp-themed-page p,
        .lp-themed-page a,
        .lp-themed-page span {
          overflow-wrap: anywhere;
        }
        .lp-site-nav {
          isolation: isolate;
        }
        .lp-site-nav__bar {
          position: relative;
        }
        .lp-site-nav__brand {
          min-width: 0;
        }
        .lp-site-nav__desktop {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: ${isEditorial ? "1.25rem" : "0.7rem"};
          flex: 1 1 auto;
          min-width: 0;
          flex-wrap: wrap;
        }
        .lp-site-nav__mobile {
          display: none;
          position: relative;
          margin-left: auto;
        }
        .lp-site-nav__summary {
          list-style: none;
        }
        .lp-site-nav__summary::-webkit-details-marker {
          display: none;
        }
        .lp-site-nav__summary:focus-visible {
          outline: 3px solid ${brandPrimary}66;
          outline-offset: 3px;
        }
        .lp-site-nav__panel {
          position: absolute;
          right: 0;
          top: calc(100% + 0.7rem);
          width: min(calc(100vw - 2rem), 340px);
          box-sizing: border-box;
          display: grid;
          gap: 0.35rem;
          padding: 0.65rem;
          border: ${isBold ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(17,24,39,0.1)"};
          border-radius: 22px;
          background: ${isBold ? "var(--lp-dark-bg,#111827)" : "var(--lp-card,#ffffff)"};
          box-shadow: 0 24px 70px rgba(15,23,42,0.22);
        }
        .lp-site-nav__mobile-cta {
          display: flex !important;
          justify-content: center;
          width: 100%;
          box-sizing: border-box;
          margin-top: 0.35rem;
          text-align: center;
        }
        .lp-site-nav__mobile-languages {
          margin-top: 0.35rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        @media (max-width: 760px) {
          .lp-site-nav__desktop {
            display: none !important;
          }
          .lp-site-nav__mobile {
            display: block;
          }
          .lp-site-nav__bar {
            min-height: 58px !important;
            padding: 0.62rem 1rem !important;
            flex-wrap: nowrap !important;
            gap: 0.75rem !important;
          }
          .lp-site-nav__brand {
            max-width: calc(100vw - 6.5rem) !important;
            font-size: 1rem !important;
            font-weight: 850 !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
        @media (max-width: 420px) {
          .lp-site-nav__panel {
            right: -0.15rem;
            width: calc(100vw - 1.25rem);
          }
        }
      `}</style>
      <nav
        className="lp-site-nav__bar"
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
          flexWrap: "nowrap",
        }}
      >
        <a
          className="lp-site-nav__brand"
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
        <div className="lp-site-nav__desktop">
          {links.map((link, index) => (
            <a
              key={`${link.label}-${link.pageSlug ?? link.href ?? ""}`}
              href={hrefWithLocale(
                hrefForLink(link, basePath),
                shouldPersistLocale ? selectedLocale : null,
              )}
              aria-current={(link.pageSlug ?? "home") === active ? "page" : undefined}
              style={activeLinkStyle(link, index)}
            >
              {link.label}
            </a>
          ))}
          {nav.cta && (
            <a
              href={hrefWithLocale(
                hrefForLink(nav.cta, basePath),
                shouldPersistLocale ? selectedLocale : null,
              )}
              {...buildTrackedCtaProps({
                label: nav.cta.label,
                href: hrefForLink(nav.cta, basePath),
                section: "site_nav",
              })}
              style={ctaStyle}
            >
              {nav.cta.label}
            </a>
          )}
          {languages && languages.locales.length > 1 && (
            <div aria-label="Language switcher" style={languageSwitcherStyle}>
              {languages.locales.map((locale) => (
                <a
                  key={locale}
                  href={hrefForLocale(basePath, active, locale)}
                  aria-current={locale === selectedLocale ? "true" : undefined}
                  style={localeLinkStyle(locale)}
                >
                  {landingLanguageShortLabel(locale)}
                </a>
              ))}
            </div>
          )}
        </div>
        <details className="lp-site-nav__mobile">
          <summary
            className="lp-site-nav__summary"
            aria-label="Open website menu"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 42,
              height: 42,
              border: isBold ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(17,24,39,0.12)",
              borderRadius: 999,
              color: isBold ? "var(--lp-dark-text,#ffffff)" : "var(--lp-text,#111827)",
              background: isBold ? "rgba(255,255,255,0.08)" : "var(--lp-card,#ffffff)",
              cursor: "pointer",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M4 6.25h12M4 10h12M4 13.75h12"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </summary>
          <div
            className="lp-site-nav__panel"
            style={{ color: isBold ? "var(--lp-dark-text,#ffffff)" : "var(--lp-text,#111827)" }}
          >
            {links.map((link) => (
              <a
                key={`mobile-${link.label}-${link.pageSlug ?? link.href ?? ""}`}
                href={hrefWithLocale(
                  hrefForLink(link, basePath),
                  shouldPersistLocale ? selectedLocale : null,
                )}
                aria-current={(link.pageSlug ?? "home") === active ? "page" : undefined}
                style={mobileLinkStyle(link)}
              >
                {link.label}
              </a>
            ))}
            {nav.cta && (
              <a
                className="lp-site-nav__mobile-cta"
                href={hrefWithLocale(
                  hrefForLink(nav.cta, basePath),
                  shouldPersistLocale ? selectedLocale : null,
                )}
                {...buildTrackedCtaProps({
                  label: nav.cta.label,
                  href: hrefForLink(nav.cta, basePath),
                  section: "site_nav",
                })}
                style={ctaStyle}
              >
                {nav.cta.label}
              </a>
            )}
            {languages && languages.locales.length > 1 && (
              <div
                className="lp-site-nav__mobile-languages"
                aria-label="Language switcher"
                style={languageSwitcherStyle}
              >
                {languages.locales.map((locale) => (
                  <a
                    key={`mobile-${locale}`}
                    href={hrefForLocale(basePath, active, locale)}
                    aria-current={locale === selectedLocale ? "true" : undefined}
                    style={localeLinkStyle(locale)}
                  >
                    {landingLanguageShortLabel(locale)}
                  </a>
                ))}
              </div>
            )}
          </div>
        </details>
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
  const links = footerLinks(site);

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
