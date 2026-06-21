import type { LeadWorkflowKind } from "./lead-capture-workflow";

export type WhatsappInboundIntent =
  | "reservation"
  | "appointment"
  | "callback"
  | "quote"
  | "generic"
  | "manual_review";

export type WhatsappLeadFacts = {
  customerName: string | null;
  email: string | null;
  phone: string | null;
  reservationDate: string | null;
  reservationTime: string | null;
  partySize: number | null;
  message: string | null;
  locationLabel: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  attachmentCount: number;
  attachmentKinds: string[];
  buttonReply: string | null;
  interactiveId: string | null;
  needsManualReview: boolean;
};

export type WhatsappConversationState = {
  serviceWindowOpen: boolean;
  policy: "session" | "template_required";
  lastInboundAt: Date | null;
  windowClosesAt: Date | null;
};

export type WhatsappConnectionHealth = {
  mode: "none" | "test_mode" | "connected";
  phoneNumberId: string | null;
  tokenSource: "none" | "env_test" | "integration_connection";
  status: "connected" | "disconnected" | "error" | "token_expired" | "test_mode" | "missing";
  expiresState: "active" | "unknown" | "expired" | "missing";
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastStatusAt: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstValue(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(record[key]);
    if (value) return value;
  }
  return null;
}

function parsePartySize(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{1,2}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferPartySizeFromText(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(
    /\b(\d{1,2})\s*(?:guests?|people|persons?|pax|personnes?|persone|personen)\b/i,
  );
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTimeFromText(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b([01]?\d|2[0-3])(?::|h)([0-5]\d)\b/i);
  if (!match) return null;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function inferDateFromText(text?: string | null, now = new Date()): string | null {
  if (!text) return null;
  const lowered = text.toLowerCase();
  const date = new Date(now);

  if (/\btomorrow\b/.test(lowered)) {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  if (/\btoday\b/.test(lowered)) {
    return date.toISOString().slice(0, 10);
  }

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const localMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (!localMatch) return null;

  const day = Number(localMatch[1]);
  const month = Number(localMatch[2]);
  const year = localMatch[3]
    ? Number(localMatch[3].length === 2 ? `20${localMatch[3]}` : localMatch[3])
    : now.getFullYear();

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;

  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(normalized.getTime())) return null;
  return normalized.toISOString().slice(0, 10);
}

function inferCustomerNameFromText(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(
    /\b(?:name is|under|for)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})\b/,
  );
  return match?.[1]?.trim() ?? null;
}

export function mapLeadWorkflowKindToWhatsappIntent(
  kind: LeadWorkflowKind,
  businessVertical?: string | null,
): WhatsappInboundIntent {
  if (kind === "booking") {
    const vertical = businessVertical?.toLowerCase() ?? "";
    return /restaurant|cafe|café|hotel|bar|bistro/.test(vertical) ? "reservation" : "appointment";
  }
  if (kind === "callback") return "callback";
  if (kind === "quote") return "quote";
  return "generic";
}

export function extractWhatsappLeadFacts(input: {
  payload?: Record<string, unknown> | null;
  text?: string | null;
  phone?: string | null;
  meta?: Record<string, unknown> | null;
}): WhatsappLeadFacts {
  const payload = input.payload ?? {};
  const meta = input.meta ?? {};
  const location = asRecord(meta["location"]);
  const attachmentKinds = Array.isArray(meta["attachmentKinds"])
    ? meta["attachmentKinds"].filter((value): value is string => typeof value === "string")
    : [];
  const text = input.text ?? null;

  const reservationDate =
    firstValue(payload, ["reservation_date", "date", "booking_date", "appointment_date"]) ??
    inferDateFromText(text);
  const reservationTime =
    firstValue(payload, ["reservation_time", "time", "booking_time", "appointment_time"]) ??
    inferTimeFromText(text);
  const partySizeRaw = firstValue(payload, ["party_size", "guest_count", "guests", "people"]);
  const partySize = parsePartySize(partySizeRaw) ?? inferPartySizeFromText(text);

  return {
    customerName:
      firstValue(payload, ["name", "full_name", "first_name", "contact_name"]) ??
      inferCustomerNameFromText(text),
    email: firstValue(payload, ["email", "e_mail", "mail"]),
    phone: firstValue(payload, ["phone", "telephone", "mobile"]) ?? input.phone ?? null,
    reservationDate,
    reservationTime,
    partySize,
    message:
      firstValue(payload, ["message", "notes", "comment", "details", "request"]) ?? text ?? null,
    locationLabel: asTrimmedString(location?.["name"]) ?? asTrimmedString(meta["locationLabel"]),
    locationLatitude: asFiniteNumber(location?.["latitude"]) ?? asFiniteNumber(meta["latitude"]),
    locationLongitude: asFiniteNumber(location?.["longitude"]) ?? asFiniteNumber(meta["longitude"]),
    attachmentCount:
      typeof meta["attachmentCount"] === "number" && Number.isFinite(meta["attachmentCount"])
        ? meta["attachmentCount"]
        : attachmentKinds.length,
    attachmentKinds,
    buttonReply:
      asTrimmedString(meta["buttonReply"]) ??
      asTrimmedString(meta["interactiveTitle"]) ??
      asTrimmedString(meta["interactiveText"]),
    interactiveId: asTrimmedString(meta["interactiveId"]),
    needsManualReview:
      meta["needsManualReview"] === true ||
      attachmentKinds.some((kind) => kind === "document" || kind === "audio"),
  };
}

export function computeWhatsappConversationState(
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): WhatsappConversationState {
  if (!lastInboundAt) {
    return {
      serviceWindowOpen: false,
      policy: "template_required",
      lastInboundAt: null,
      windowClosesAt: null,
    };
  }

  const windowClosesAt = new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000);
  const serviceWindowOpen = windowClosesAt.getTime() > now.getTime();
  return {
    serviceWindowOpen,
    policy: serviceWindowOpen ? "session" : "template_required",
    lastInboundAt,
    windowClosesAt,
  };
}

export function summarizeWhatsappConnectionHealth(input: {
  connectionStatus?: "connected" | "disconnected" | "error" | "token_expired" | null;
  phoneNumberId?: string | null;
  hasAccessToken?: boolean;
  isTestMode?: boolean;
  meta?: Record<string, unknown> | null;
}): WhatsappConnectionHealth {
  const meta = input.meta ?? {};
  const mode = input.isTestMode
    ? "test_mode"
    : input.connectionStatus === "connected" || input.phoneNumberId
      ? "connected"
      : "none";
  const tokenSource = input.isTestMode
    ? "env_test"
    : input.hasAccessToken
      ? "integration_connection"
      : "none";
  const status = input.isTestMode
    ? "test_mode"
    : (input.connectionStatus ?? (input.phoneNumberId ? "connected" : "missing"));
  const expiresState =
    status === "token_expired"
      ? "expired"
      : input.isTestMode
        ? "unknown"
        : input.hasAccessToken
          ? "active"
          : "missing";

  return {
    mode,
    phoneNumberId: input.phoneNumberId ?? null,
    tokenSource,
    status,
    expiresState,
    lastInboundAt: asTrimmedString(meta["lastInboundAt"]),
    lastOutboundAt: asTrimmedString(meta["lastOutboundAt"]),
    lastStatusAt: asTrimmedString(meta["lastStatusAt"]),
    lastFailureAt: asTrimmedString(meta["lastFailureAt"]),
    lastFailureMessage: asTrimmedString(meta["lastFailureMessage"]),
  };
}
