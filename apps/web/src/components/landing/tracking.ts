type CtaTrackingInput = {
  label?: string | null;
  href?: string | null;
  section?: string | null;
};

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferChannel(href?: string | null): string | null {
  const value = href?.toLowerCase() ?? "";
  if (value.startsWith("tel:")) return "phone";
  if (value.startsWith("mailto:")) return "email";
  if (value.includes("wa.me") || value.includes("whatsapp")) return "whatsapp";
  return null;
}

function inferIntent(input: {
  href?: string | null;
  label?: string | null;
  section?: string | null;
}): string {
  const href = input.href?.toLowerCase() ?? "";
  const label = input.label?.toLowerCase() ?? "";

  if (href.startsWith("tel:")) return "phone_lead";
  if (href.startsWith("mailto:")) return "email_lead";
  if (href.includes("wa.me") || href.includes("whatsapp")) return "whatsapp_lead";
  if (href.includes("#lp-lead-form")) return "lead_form";
  if (/quote|offer|estimate|devis|preventivo/i.test(label)) return "quote_request";
  if (/callback|call|phone|appel|richiam/i.test(label)) return "callback_request";
  if (/book|reserve|reservation|appointment|prenot/i.test(label)) return "booking_request";
  if (/contact|message|get in touch|talk/i.test(label)) return "contact_request";
  return `${input.section ?? "page"}_cta`;
}

export function buildTrackedCtaProps(input: CtaTrackingInput): Record<string, string> {
  const label = normalizeText(input.label);
  const href = normalizeText(input.href);
  const section = normalizeText(input.section);
  const channel = inferChannel(href);
  const intent = inferIntent({ href, label, section });

  const attrs: Record<string, string> = {
    "data-track": "cta",
    "data-track-intent": intent,
  };

  if (label) attrs["data-track-label"] = label;
  if (href) attrs["data-track-href"] = href;
  if (section) attrs["data-track-section"] = section;
  if (channel) attrs["data-track-channel"] = channel;

  return attrs;
}
