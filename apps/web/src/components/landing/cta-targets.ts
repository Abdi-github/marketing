import type { LandingPageComposition, LandingPageSiteLink } from "@marketing/ai-router";

export const LEAD_FORM_ANCHOR_ID = "lp-lead-form";
export const CONTACT_ANCHOR_ID = "lp-contact";

const LEAD_FORM_ALIASES = new Set([
  "lp-lead-form",
  "lead",
  "lead-form",
  "form",
  "request",
  "quote",
  "callback",
  "appointment",
  "booking",
  "book",
  "reserve",
  "reservation",
  "kontakt",
  "kontaktformular",
  "buchung",
  "reservieren",
  "contatto",
  "prenota",
  "reservation",
  "reserver",
  "devis",
]);

const CONTACT_ALIASES = new Set([
  "lp-contact",
  "contact",
  "contacts",
  "kontakt",
  "contatto",
  "contatti",
  "adresse",
  "address",
]);

const LEAD_ACTION_LABEL_RE =
  /\b(book|booking|reserve|reservation|table|quote|callback|call back|appointment|request|enquiry|inquiry|contact us|subscribe|newsletter|anfrage|angebot|termin|tisch|reserv|rappel|devis|offre|prenota|preventivo|richiedi)\b/i;

function cleanAnchor(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

type NormalizeCtaHrefOptions = {
  preferLeadForContact?: boolean;
};

function appendHash(href: string, hash: string): string {
  if (href.includes("#")) return href;
  return `${href}${hash}`;
}

export function normalizeSectionAnchorId(
  sectionId?: string | null,
  options: NormalizeCtaHrefOptions = {},
): string | null {
  if (!sectionId) return null;
  const clean = cleanAnchor(sectionId);
  if (LEAD_FORM_ALIASES.has(clean)) return LEAD_FORM_ANCHOR_ID;
  if (options.preferLeadForContact && CONTACT_ALIASES.has(clean)) return LEAD_FORM_ANCHOR_ID;
  if (CONTACT_ALIASES.has(clean)) return CONTACT_ANCHOR_ID;
  return sectionId.replace(/^#/, "");
}

export function normalizeLandingCtaHref(
  href?: string | null,
  options: NormalizeCtaHrefOptions = {},
): string {
  const raw = href?.trim();
  if (!raw) return `#${LEAD_FORM_ANCHOR_ID}`;

  if (raw.startsWith("#")) {
    const anchor = normalizeSectionAnchorId(raw, options);
    return anchor ? `#${anchor}` : raw;
  }

  const hashIndex = raw.indexOf("#");
  if (hashIndex >= 0) {
    const beforeHash = raw.slice(0, hashIndex);
    const anchor = normalizeSectionAnchorId(raw.slice(hashIndex + 1), options);
    return anchor ? `${beforeHash}#${anchor}` : raw;
  }

  if (/^\.\/contact\/?$/i.test(raw) || /^\/?contact\/?$/i.test(raw)) {
    return appendHash(raw.replace(/\/$/, ""), `#${LEAD_FORM_ANCHOR_ID}`);
  }

  return raw;
}

export function isLeadActionLabel(label?: string | null): boolean {
  return LEAD_ACTION_LABEL_RE.test(label ?? "");
}

export function anchorIdsForSection(
  type: LandingPageComposition["sections"][number]["type"],
): string[] {
  if (type === "lead_form") {
    return [
      LEAD_FORM_ANCHOR_ID,
      "lead-form",
      "lead",
      "form",
      "booking",
      "book",
      "reserve",
      "reservation",
      "quote",
      "callback",
      "appointment",
    ];
  }
  if (type === "contact") return [CONTACT_ANCHOR_ID, "contact"];
  return [];
}

export function resolveLandingSiteLinkHref(link: LandingPageSiteLink, basePath: string): string {
  const cleanBase = basePath.length > 1 ? basePath.replace(/\/+$/, "") : basePath;
  const normalizedSectionId = normalizeSectionAnchorId(link.sectionId);
  const leadHash = isLeadActionLabel(link.label) ? `#${LEAD_FORM_ANCHOR_ID}` : "";
  const explicitHash = normalizedSectionId ? `#${normalizedSectionId}` : leadHash;

  if (link.href) {
    const normalizedHref = normalizeLandingCtaHref(link.href, {
      preferLeadForContact: isLeadActionLabel(link.label),
    });
    if (/^(https?:\/\/|mailto:|tel:)/i.test(normalizedHref)) return normalizedHref;
    if (!/^(#|\/|\.{1,2}\/)/i.test(normalizedHref)) return "#";
    return leadHash && !normalizedHref.includes("#")
      ? appendHash(normalizedHref, leadHash)
      : normalizedHref;
  }

  if (!link.pageSlug || link.pageSlug === "home") return `${cleanBase}${explicitHash}`;
  return `${cleanBase}/${link.pageSlug}${explicitHash}`;
}
