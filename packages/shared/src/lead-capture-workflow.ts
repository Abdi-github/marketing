export type LeadWorkflowKind = "booking" | "callback" | "quote" | "generic";
export type LeadTaskPriority = "low" | "normal" | "high";
export type LeadConfirmationChannel = "email" | "whatsapp" | "sms";
export type LeadChannelPreference = "auto" | LeadConfirmationChannel;
export type SupportedLeadLocale = "de-CH" | "fr-CH" | "it-CH" | "en";
export type LeadCaptureSettings = {
  preferredConfirmationChannel?: LeadChannelPreference;
  reservationConfirmationMessage?: string | null;
  callbackConfirmationMessage?: string | null;
  quoteConfirmationMessage?: string | null;
  genericConfirmationMessage?: string | null;
};

type StoredFormShape = {
  name: string;
  slug: string;
  submitLabel?: string | null;
  steps?: unknown;
  schema?: unknown;
};

type MinimalStepField = {
  name: string;
  type: string;
};

type MinimalFormStep = {
  fields: MinimalStepField[];
};

export type LeadWorkflowPlan = {
  kind: LeadWorkflowKind;
  priority: LeadTaskPriority;
  title: string;
  body: string;
  dueInHours: number;
};

export type LeadConfirmationCopy = {
  subject: string;
  body: string;
  shortBody: string;
};

const DEFAULT_LEAD_CAPTURE_SETTINGS: Required<LeadCaptureSettings> = {
  preferredConfirmationChannel: "auto",
  reservationConfirmationMessage: null,
  callbackConfirmationMessage: null,
  quoteConfirmationMessage: null,
  genericConfirmationMessage: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function looksLikeSteps(steps: unknown): steps is MinimalFormStep[] {
  return (
    Array.isArray(steps) &&
    steps.every(
      (step) =>
        isRecord(step) &&
        Array.isArray(step["fields"]) &&
        step["fields"].every(
          (field) =>
            isRecord(field) &&
            typeof field["name"] === "string" &&
            typeof field["type"] === "string",
        ),
    )
  );
}

function getFieldNamesFromSteps(steps: MinimalFormStep[]): string[] {
  return steps.flatMap((step) => step.fields.map((field) => field.name.toLowerCase()));
}

function getFieldNamesFromSchema(schema: unknown): string[] {
  if (!isRecord(schema)) return [];
  const properties = isRecord(schema["properties"])
    ? (schema["properties"] as Record<string, unknown>)
    : {};
  return Object.keys(properties).map((key) => key.toLowerCase());
}

function collectSignals(form: StoredFormShape, payload: Record<string, unknown>) {
  const fieldNames = looksLikeSteps(form.steps)
    ? getFieldNamesFromSteps(form.steps)
    : getFieldNamesFromSchema(form.schema);

  const payloadKeys = Object.keys(payload).map((key) => key.toLowerCase());
  const payloadValues = Object.values(payload)
    .map((value) => asTrimmedString(value))
    .filter((value): value is string => Boolean(value));

  const signalText = [
    form.name,
    form.slug,
    form.submitLabel ?? "",
    ...fieldNames,
    ...payloadKeys,
    ...payloadValues.slice(0, 8),
  ]
    .join(" ")
    .toLowerCase();

  return {
    fieldNames: new Set(fieldNames),
    payloadKeys: new Set(payloadKeys),
    signalText,
  };
}

function firstNonEmpty(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(payload[key]);
    if (value) return value;
  }
  return null;
}

function normalizeLocale(locale?: string | null): SupportedLeadLocale {
  if (locale === "de-CH" || locale === "fr-CH" || locale === "it-CH" || locale === "en") {
    return locale;
  }
  return "en";
}

function shortenConfirmationText(text: string, limit = 220): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}...`;
}

function customConfirmationMessageForKind(
  settings: LeadCaptureSettings | null | undefined,
  kind: LeadWorkflowKind,
): string | null {
  const value =
    kind === "booking"
      ? settings?.reservationConfirmationMessage
      : kind === "callback"
        ? settings?.callbackConfirmationMessage
        : kind === "quote"
          ? settings?.quoteConfirmationMessage
          : settings?.genericConfirmationMessage;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeLeadCaptureSettings(value: unknown): Required<LeadCaptureSettings> {
  if (!isRecord(value)) {
    return { ...DEFAULT_LEAD_CAPTURE_SETTINGS };
  }

  const preferredConfirmationChannel =
    value["preferredConfirmationChannel"] === "email" ||
    value["preferredConfirmationChannel"] === "whatsapp" ||
    value["preferredConfirmationChannel"] === "sms"
      ? value["preferredConfirmationChannel"]
      : "auto";

  return {
    preferredConfirmationChannel,
    reservationConfirmationMessage:
      typeof value["reservationConfirmationMessage"] === "string" &&
      value["reservationConfirmationMessage"].trim()
        ? value["reservationConfirmationMessage"].trim()
        : null,
    callbackConfirmationMessage:
      typeof value["callbackConfirmationMessage"] === "string" &&
      value["callbackConfirmationMessage"].trim()
        ? value["callbackConfirmationMessage"].trim()
        : null,
    quoteConfirmationMessage:
      typeof value["quoteConfirmationMessage"] === "string" &&
      value["quoteConfirmationMessage"].trim()
        ? value["quoteConfirmationMessage"].trim()
        : null,
    genericConfirmationMessage:
      typeof value["genericConfirmationMessage"] === "string" &&
      value["genericConfirmationMessage"].trim()
        ? value["genericConfirmationMessage"].trim()
        : null,
  };
}

export function getLeadConfirmationChannelOrder(
  preference?: LeadChannelPreference | null,
): LeadConfirmationChannel[] {
  const defaultOrder: LeadConfirmationChannel[] = ["email", "whatsapp", "sms"];
  if (!preference || preference === "auto") return defaultOrder;
  return [preference, ...defaultOrder.filter((channel) => channel !== preference)];
}

export function inferLeadWorkflowKind(
  form: StoredFormShape,
  payload: Record<string, unknown>,
): LeadWorkflowKind {
  const { fieldNames, payloadKeys, signalText } = collectSignals(form, payload);

  const hasSignal = (...keys: string[]) =>
    keys.some((key) => fieldNames.has(key) || payloadKeys.has(key));

  if (
    hasSignal("date", "time", "party_size", "guests", "guest_count", "reservation_date") ||
    /\b(book|booking|reservation|reserve|table|guests?|party|appointment|termin|rendez|prenot)\b/.test(
      signalText,
    )
  ) {
    return "booking";
  }

  if (
    hasSignal("preferred_time", "callback_time", "best_time", "phone") &&
    /\b(callback|call\s?back|call me|telephone|telefon|appel|richiam|whatsapp)\b/.test(signalText)
  ) {
    return "callback";
  }

  if (
    hasSignal("service", "project_type", "budget", "quote_type") ||
    /\b(quote|offer|estimate|pricing|service|project|devis|offre|preventivo|angebot|anfrage)\b/.test(
      signalText,
    )
  ) {
    return "quote";
  }

  return "generic";
}

export function buildLeadWorkflowPlan(
  form: StoredFormShape,
  payload: Record<string, unknown>,
  sourceUrl?: string | null,
): LeadWorkflowPlan {
  const kind = inferLeadWorkflowKind(form, payload);
  const message = firstNonEmpty(payload, ["message", "notes", "comment", "details", "request"]);

  if (kind === "booking") {
    const date = firstNonEmpty(payload, ["date", "reservation_date"]);
    const time = firstNonEmpty(payload, ["time", "reservation_time"]);
    const partySize = firstNonEmpty(payload, ["party_size", "guests", "guest_count"]);
    const bodyParts = [
      `New booking request from ${form.name}.`,
      date ? `Date: ${date}` : null,
      time ? `Time: ${time}` : null,
      partySize ? `Guests: ${partySize}` : null,
      message ? `Message: ${message}` : null,
      sourceUrl ? `Source: ${sourceUrl}` : null,
    ].filter(Boolean);

    return {
      kind,
      priority: "high",
      title: "Confirm reservation request",
      body: bodyParts.join(" "),
      dueInHours: 1,
    };
  }

  if (kind === "callback") {
    const preferredTime = firstNonEmpty(payload, ["preferred_time", "callback_time", "best_time"]);
    const bodyParts = [
      `New callback request from ${form.name}.`,
      preferredTime ? `Preferred time: ${preferredTime}` : null,
      message ? `Message: ${message}` : null,
      sourceUrl ? `Source: ${sourceUrl}` : null,
    ].filter(Boolean);

    return {
      kind,
      priority: "high",
      title: "Call back new lead",
      body: bodyParts.join(" "),
      dueInHours: 2,
    };
  }

  if (kind === "quote") {
    const service = firstNonEmpty(payload, ["service", "project_type", "quote_type"]);
    const bodyParts = [
      `New quote request from ${form.name}.`,
      service ? `Need: ${service}` : null,
      message ? `Message: ${message}` : null,
      sourceUrl ? `Source: ${sourceUrl}` : null,
    ].filter(Boolean);

    return {
      kind,
      priority: "high",
      title: "Prepare quote reply",
      body: bodyParts.join(" "),
      dueInHours: 8,
    };
  }

  return {
    kind,
    priority: "normal",
    title: `Follow up new ${form.name} lead`,
    body: sourceUrl
      ? `New form submission from ${form.name}. Source: ${sourceUrl}`
      : `New form submission from ${form.name}.`,
    dueInHours: 4,
  };
}

export function buildLeadTaskDueAt(plan: LeadWorkflowPlan, now = new Date()): Date {
  const dueAt = new Date(now);
  dueAt.setHours(dueAt.getHours() + plan.dueInHours);
  return dueAt;
}

export function splitContactName(payload: Record<string, unknown>): {
  firstName: string | null;
  lastName: string | null;
} {
  const rawName =
    firstNonEmpty(payload, ["name", "fullName", "full_name"]) ??
    [
      firstNonEmpty(payload, ["firstName", "first_name"]),
      firstNonEmpty(payload, ["lastName", "last_name"]),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (!rawName) {
    return { firstName: null, lastName: null };
  }

  const spaceIdx = rawName.indexOf(" ");
  return {
    firstName: spaceIdx > -1 ? rawName.slice(0, spaceIdx) : rawName,
    lastName: spaceIdx > -1 ? rawName.slice(spaceIdx + 1) || null : null,
  };
}

export function buildPhoneLeadPlaceholderEmail(phone: string): string {
  const normalized = phone
    .replace(/[^\d+]/g, "")
    .replace(/^\+/, "plus-")
    .toLowerCase();
  return `lead-${normalized || "unknown"}@noreply.form`;
}

export function isPlaceholderLeadEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase().endsWith("@noreply.form"));
}

export function buildLeadConfirmationCopy(input: {
  kind: LeadWorkflowKind;
  businessName: string;
  locale?: string | null;
  payload: Record<string, unknown>;
  settings?: LeadCaptureSettings | null;
}): LeadConfirmationCopy {
  const locale = normalizeLocale(input.locale);
  const date = firstNonEmpty(input.payload, ["date", "reservation_date"]);
  const time = firstNonEmpty(input.payload, ["time", "reservation_time"]);
  const guests = firstNonEmpty(input.payload, ["party_size", "guests", "guest_count"]);
  const customBody = customConfirmationMessageForKind(input.settings, input.kind);

  if (locale === "de-CH") {
    if (input.kind === "booking") {
      const details = [
        date ? `Datum: ${date}` : null,
        time ? `Zeit: ${time}` : null,
        guests ? `Personen: ${guests}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const copy = {
        subject: `Ihre Anfrage bei ${input.businessName}`,
        body: `Danke fuer Ihre Reservierungsanfrage bei ${input.businessName}. ${details ? `${details}. ` : ""}Wir bestaetigen Ihren Wunsch so bald wie moeglich.`,
        shortBody: `Danke fuer Ihre Anfrage bei ${input.businessName}. Wir bestaetigen Ihre Reservierung so bald wie moeglich.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "callback") {
      const copy = {
        subject: `Rueckrufanfrage bei ${input.businessName}`,
        body: `Danke fuer Ihre Rueckrufanfrage bei ${input.businessName}. Unser Team meldet sich so bald wie moeglich bei Ihnen.`,
        shortBody: `Danke fuer Ihre Rueckrufanfrage bei ${input.businessName}. Wir melden uns bald.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "quote") {
      const copy = {
        subject: `Anfrage bei ${input.businessName}`,
        body: `Danke fuer Ihre Anfrage bei ${input.businessName}. Wir pruefen Ihr Anliegen und antworten so bald wie moeglich.`,
        shortBody: `Danke fuer Ihre Anfrage bei ${input.businessName}. Wir antworten bald.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    const copy = {
      subject: `Danke fuer Ihre Nachricht an ${input.businessName}`,
      body: `Danke fuer Ihre Nachricht an ${input.businessName}. Unser Team meldet sich so bald wie moeglich bei Ihnen.`,
      shortBody: `Danke fuer Ihre Nachricht an ${input.businessName}. Wir melden uns bald.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }

  if (locale === "fr-CH") {
    if (input.kind === "booking") {
      const details = [
        date ? `Date: ${date}` : null,
        time ? `Heure: ${time}` : null,
        guests ? `Personnes: ${guests}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const copy = {
        subject: `Votre demande chez ${input.businessName}`,
        body: `Merci pour votre demande de reservation chez ${input.businessName}. ${details ? `${details}. ` : ""}Nous confirmons cela tres prochainement.`,
        shortBody: `Merci pour votre demande chez ${input.businessName}. Nous confirmons votre reservation tres bientot.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "callback") {
      const copy = {
        subject: `Demande de rappel chez ${input.businessName}`,
        body: `Merci pour votre demande de rappel chez ${input.businessName}. Notre equipe vous recontacte tres bientot.`,
        shortBody: `Merci pour votre demande de rappel chez ${input.businessName}. Nous vous rappelons bientot.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "quote") {
      const copy = {
        subject: `Votre demande chez ${input.businessName}`,
        body: `Merci pour votre demande chez ${input.businessName}. Nous etudions votre besoin et revenons vers vous tres bientot.`,
        shortBody: `Merci pour votre demande chez ${input.businessName}. Nous revenons vers vous bientot.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    const copy = {
      subject: `Merci pour votre message a ${input.businessName}`,
      body: `Merci pour votre message a ${input.businessName}. Notre equipe vous recontacte tres bientot.`,
      shortBody: `Merci pour votre message a ${input.businessName}. Nous revenons vers vous bientot.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }

  if (locale === "it-CH") {
    if (input.kind === "booking") {
      const details = [
        date ? `Data: ${date}` : null,
        time ? `Ora: ${time}` : null,
        guests ? `Persone: ${guests}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const copy = {
        subject: `La tua richiesta per ${input.businessName}`,
        body: `Grazie per la tua richiesta di prenotazione per ${input.businessName}. ${details ? `${details}. ` : ""}Ti confermeremo tutto al piu presto.`,
        shortBody: `Grazie per la tua richiesta per ${input.businessName}. Confermeremo la prenotazione al piu presto.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "callback") {
      const copy = {
        subject: `Richiesta di richiamata per ${input.businessName}`,
        body: `Grazie per la tua richiesta di richiamata per ${input.businessName}. Il nostro team ti contattera al piu presto.`,
        shortBody: `Grazie per la tua richiesta di richiamata per ${input.businessName}. Ti richiamiamo presto.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    if (input.kind === "quote") {
      const copy = {
        subject: `La tua richiesta per ${input.businessName}`,
        body: `Grazie per la tua richiesta per ${input.businessName}. Valuteremo il tuo bisogno e ti risponderemo al piu presto.`,
        shortBody: `Grazie per la tua richiesta per ${input.businessName}. Ti risponderemo presto.`,
      };
      return customBody
        ? {
            subject: copy.subject,
            body: customBody,
            shortBody: shortenConfirmationText(customBody),
          }
        : copy;
    }
    const copy = {
      subject: `Grazie per il tuo messaggio a ${input.businessName}`,
      body: `Grazie per il tuo messaggio a ${input.businessName}. Il nostro team ti rispondera al piu presto.`,
      shortBody: `Grazie per il tuo messaggio a ${input.businessName}. Ti risponderemo presto.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }

  if (input.kind === "booking") {
    const details = [
      date ? `Date: ${date}` : null,
      time ? `Time: ${time}` : null,
      guests ? `Guests: ${guests}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const copy = {
      subject: `Your request for ${input.businessName}`,
      body: `Thanks for your booking request for ${input.businessName}. ${details ? `${details}. ` : ""}We will confirm it shortly.`,
      shortBody: `Thanks for your request for ${input.businessName}. We will confirm your booking shortly.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }
  if (input.kind === "callback") {
    const copy = {
      subject: `Callback request for ${input.businessName}`,
      body: `Thanks for your callback request for ${input.businessName}. Our team will contact you shortly.`,
      shortBody: `Thanks for your callback request for ${input.businessName}. We will contact you shortly.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }
  if (input.kind === "quote") {
    const copy = {
      subject: `Your request for ${input.businessName}`,
      body: `Thanks for your request for ${input.businessName}. We will review it and reply shortly.`,
      shortBody: `Thanks for your request for ${input.businessName}. We will reply shortly.`,
    };
    return customBody
      ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
      : copy;
  }
  const copy = {
    subject: `Thanks for contacting ${input.businessName}`,
    body: `Thanks for contacting ${input.businessName}. Our team will get back to you shortly.`,
    shortBody: `Thanks for contacting ${input.businessName}. We will get back to you shortly.`,
  };
  return customBody
    ? { subject: copy.subject, body: customBody, shortBody: shortenConfirmationText(customBody) }
    : copy;
}
