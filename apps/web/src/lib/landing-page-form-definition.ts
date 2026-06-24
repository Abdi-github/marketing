import type { LandingPageComposition, LandingPageSection } from "@marketing/ai-router";
import type { FormField, FormSettings, FormStep } from "@marketing/ai-router/form-schema";

type SupportedLocale = "de-CH" | "fr-CH" | "it-CH" | "en";
type LandingFormKind = "quote" | "booking" | "callback" | "generic";
export type LeadCaptureChannel = "email" | "phone" | "sms" | "whatsapp";

type CopySet = {
  quote: {
    name: string;
    submitLabel: string;
    successMessage: string;
    stepOneTitle: string;
    stepTwoTitle: string;
    serviceLabel: string;
    servicePlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
  };
  callback: {
    name: string;
    submitLabel: string;
    successMessage: string;
    stepOneTitle: string;
    stepTwoTitle: string;
    preferredTimeLabel: string;
    preferredTimePlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
  };
  booking: {
    name: string;
    submitLabel: string;
    successMessage: string;
    stepOneTitle: string;
    stepTwoTitle: string;
    dateLabel: string;
    timeLabel: string;
    guestsLabel: string;
    messageLabel: string;
    messagePlaceholder: string;
  };
  common: {
    nameLabel: string;
    emailLabel: string;
    phoneLabel: string;
    preferredChannelLabel: string;
    preferredEmailLabel: string;
    preferredPhoneLabel: string;
    preferredSmsLabel: string;
    preferredWhatsappLabel: string;
  };
};

const COPY_BY_LOCALE: Record<SupportedLocale, CopySet> = {
  "de-CH": {
    quote: {
      name: "Anfrageformular",
      submitLabel: "Angebot anfragen",
      successMessage: "Danke. Wir melden uns so bald wie moeglich.",
      stepOneTitle: "Kontaktdaten",
      stepTwoTitle: "Ihre Anfrage",
      serviceLabel: "Worum geht es?",
      servicePlaceholder: "Kurz beschreiben, was Sie brauchen",
      messageLabel: "Nachricht",
      messagePlaceholder: "Ein paar Details helfen uns, passend zu antworten.",
    },
    callback: {
      name: "Rueckrufanfrage",
      submitLabel: "Rueckruf anfragen",
      successMessage: "Danke. Wir melden uns telefonisch so bald wie moeglich.",
      stepOneTitle: "Ihre Kontaktdaten",
      stepTwoTitle: "Rueckrufwunsch",
      preferredTimeLabel: "Bevorzugte Zeit",
      preferredTimePlaceholder: "Zum Beispiel heute Nachmittag",
      messageLabel: "Worum geht es?",
      messagePlaceholder: "Ein kurzer Hinweis hilft dem Team beim Rueckruf.",
    },
    booking: {
      name: "Buchungsanfrage",
      submitLabel: "Buchung anfragen",
      successMessage: "Danke. Wir bestaetigen Ihre Anfrage so bald wie moeglich.",
      stepOneTitle: "Ihre Angaben",
      stepTwoTitle: "Wunschtermin",
      dateLabel: "Wunschdatum",
      timeLabel: "Wunschzeit",
      guestsLabel: "Anzahl Personen",
      messageLabel: "Mitteilung",
      messagePlaceholder: "Besondere Wuensche, Allergien oder weitere Hinweise.",
    },
    common: {
      nameLabel: "Name",
      emailLabel: "E-Mail",
      phoneLabel: "Telefon",
      preferredChannelLabel: "Bevorzugter Kontakt",
      preferredEmailLabel: "E-Mail",
      preferredPhoneLabel: "Telefonanruf",
      preferredSmsLabel: "SMS",
      preferredWhatsappLabel: "WhatsApp",
    },
  },
  "fr-CH": {
    quote: {
      name: "Formulaire de demande",
      submitLabel: "Demander une offre",
      successMessage: "Merci. Nous vous recontactons tres bientot.",
      stepOneTitle: "Coordonnees",
      stepTwoTitle: "Votre demande",
      serviceLabel: "De quoi avez-vous besoin ?",
      servicePlaceholder: "Decrivez brievement votre besoin",
      messageLabel: "Message",
      messagePlaceholder: "Quelques details nous aident a vous repondre utilement.",
    },
    callback: {
      name: "Demande de rappel",
      submitLabel: "Demander un rappel",
      successMessage: "Merci. Nous vous rappellerons tres bientot.",
      stepOneTitle: "Vos coordonnees",
      stepTwoTitle: "Votre rappel",
      preferredTimeLabel: "Moment prefere",
      preferredTimePlaceholder: "Par exemple cet apres-midi",
      messageLabel: "Sujet",
      messagePlaceholder: "Quelques mots pour aider l'equipe a vous rappeler.",
    },
    booking: {
      name: "Demande de reservation",
      submitLabel: "Demander une reservation",
      successMessage: "Merci. Nous confirmons votre demande tres bientot.",
      stepOneTitle: "Vos coordonnees",
      stepTwoTitle: "Moment souhaite",
      dateLabel: "Date souhaitee",
      timeLabel: "Heure souhaitee",
      guestsLabel: "Nombre de personnes",
      messageLabel: "Message",
      messagePlaceholder: "Precisez vos besoins ou informations utiles.",
    },
    common: {
      nameLabel: "Nom",
      emailLabel: "E-mail",
      phoneLabel: "Telephone",
      preferredChannelLabel: "Contact prefere",
      preferredEmailLabel: "E-mail",
      preferredPhoneLabel: "Appel",
      preferredSmsLabel: "SMS",
      preferredWhatsappLabel: "WhatsApp",
    },
  },
  "it-CH": {
    quote: {
      name: "Modulo di richiesta",
      submitLabel: "Richiedi un preventivo",
      successMessage: "Grazie. Ti risponderemo al piu presto.",
      stepOneTitle: "Contatti",
      stepTwoTitle: "La tua richiesta",
      serviceLabel: "Di cosa hai bisogno?",
      servicePlaceholder: "Descrivi brevemente la tua richiesta",
      messageLabel: "Messaggio",
      messagePlaceholder: "Qualche dettaglio ci aiuta a risponderti meglio.",
    },
    callback: {
      name: "Richiesta di richiamata",
      submitLabel: "Richiedi richiamata",
      successMessage: "Grazie. Ti richiameremo al piu presto.",
      stepOneTitle: "I tuoi contatti",
      stepTwoTitle: "Dettagli della chiamata",
      preferredTimeLabel: "Orario preferito",
      preferredTimePlaceholder: "Per esempio oggi pomeriggio",
      messageLabel: "Motivo",
      messagePlaceholder: "Una breve nota aiuta il team a richiamarti meglio.",
    },
    booking: {
      name: "Richiesta di prenotazione",
      submitLabel: "Richiedi prenotazione",
      successMessage: "Grazie. Confermeremo la tua richiesta al piu presto.",
      stepOneTitle: "I tuoi dati",
      stepTwoTitle: "Momento preferito",
      dateLabel: "Data preferita",
      timeLabel: "Ora preferita",
      guestsLabel: "Numero di persone",
      messageLabel: "Messaggio",
      messagePlaceholder: "Esigenze particolari o note utili.",
    },
    common: {
      nameLabel: "Nome",
      emailLabel: "E-mail",
      phoneLabel: "Telefono",
      preferredChannelLabel: "Contatto preferito",
      preferredEmailLabel: "E-mail",
      preferredPhoneLabel: "Telefonata",
      preferredSmsLabel: "SMS",
      preferredWhatsappLabel: "WhatsApp",
    },
  },
  en: {
    quote: {
      name: "Inquiry form",
      submitLabel: "Request quote",
      successMessage: "Thanks. We will get back to you shortly.",
      stepOneTitle: "Contact details",
      stepTwoTitle: "Your request",
      serviceLabel: "What do you need?",
      servicePlaceholder: "Tell us briefly what you are looking for",
      messageLabel: "Message",
      messagePlaceholder: "A few details help us send a useful reply.",
    },
    callback: {
      name: "Callback request",
      submitLabel: "Request a callback",
      successMessage: "Thanks. We'll call you back shortly.",
      stepOneTitle: "Your contact details",
      stepTwoTitle: "Callback request",
      preferredTimeLabel: "Best time to reach you",
      preferredTimePlaceholder: "For example, this afternoon",
      messageLabel: "What can we help with?",
      messagePlaceholder: "A short note helps the team call you prepared.",
    },
    booking: {
      name: "Booking request",
      submitLabel: "Request booking",
      successMessage: "Thanks. We will confirm your request shortly.",
      stepOneTitle: "Your details",
      stepTwoTitle: "Preferred visit",
      dateLabel: "Preferred date",
      timeLabel: "Preferred time",
      guestsLabel: "Number of people",
      messageLabel: "Message",
      messagePlaceholder: "Special requests or anything we should know.",
    },
    common: {
      nameLabel: "Name",
      emailLabel: "Email",
      phoneLabel: "Phone",
      preferredChannelLabel: "Preferred contact",
      preferredEmailLabel: "Email",
      preferredPhoneLabel: "Phone call",
      preferredSmsLabel: "SMS",
      preferredWhatsappLabel: "WhatsApp",
    },
  },
};

export type AutoLandingFormDefinition = {
  name: string;
  submitLabel: string;
  settings: FormSettings;
  steps: FormStep[];
  schema: Record<string, unknown>;
  kind: LandingFormKind;
  captureChannels: LeadCaptureChannel[];
};

const ALL_CAPTURE_CHANNELS: LeadCaptureChannel[] = ["email", "phone", "sms", "whatsapp"];

function normalizeLocale(locale?: string | null): SupportedLocale {
  if (locale === "de-CH" || locale === "fr-CH" || locale === "it-CH" || locale === "en") {
    return locale;
  }
  return "en";
}

function looksLikeBookingVertical(vertical?: string | null): boolean {
  if (!vertical) return false;
  return /hotel|restaurant|cafe|clinic|fitness|studio|spa|wellness|salon|beauty|dental|physio|praxis|booking|reservation/i.test(
    vertical,
  );
}

function looksLikeCallbackIntent(text?: string | null): boolean {
  if (!text) return false;
  return /callback|call\s?(back|me)?|phone|telephone|telefon|appel|richiam|whatsapp/i.test(text);
}

function inferLeadFormKind(input: {
  vertical?: string | null;
  goal?: string | null;
  composition?: LandingPageComposition | null;
}): LandingFormKind {
  if (input.goal === "appointment_booking" || looksLikeBookingVertical(input.vertical)) {
    return "booking";
  }

  const sections = [
    ...(input.composition?.sections ?? []),
    ...(input.composition?.site?.pages?.flatMap((page) => page.sections) ?? []),
  ];
  const copySignals = sections
    .flatMap((section) => {
      const extras = (section.extras as Record<string, unknown> | undefined) ?? {};
      return [
        section.heading,
        section.body,
        typeof extras["ctaText"] === "string" ? (extras["ctaText"] as string) : null,
      ];
    })
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  if (input.goal === "lead_capture" && looksLikeCallbackIntent(copySignals)) {
    return "callback";
  }

  return "quote";
}

export function normalizeLeadCaptureChannels(
  channels: readonly string[] | null | undefined,
  kind: LandingFormKind = "quote",
): LeadCaptureChannel[] {
  const normalized = Array.from(
    new Set(
      (channels ?? []).filter((value): value is LeadCaptureChannel =>
        ALL_CAPTURE_CHANNELS.includes(value as LeadCaptureChannel),
      ),
    ),
  );

  if (normalized.length > 0) return normalized;
  if (kind === "callback") return ["phone", "sms"];
  if (kind === "booking") return ["email", "phone", "sms", "whatsapp"];
  return ["email", "phone"];
}

function channelsNeedPhone(channels: LeadCaptureChannel[]): boolean {
  return channels.some(
    (channel) => channel === "phone" || channel === "sms" || channel === "whatsapp",
  );
}

function preferredChannelOptions(
  channels: LeadCaptureChannel[],
  copy: CopySet,
): NonNullable<FormField["options"]> {
  return channels.map((channel) => {
    if (channel === "email") return { value: "email", label: copy.common.preferredEmailLabel };
    if (channel === "sms") return { value: "sms", label: copy.common.preferredSmsLabel };
    if (channel === "whatsapp") {
      return { value: "whatsapp", label: copy.common.preferredWhatsappLabel };
    }
    return { value: "phone", label: copy.common.preferredPhoneLabel };
  });
}

function fieldSchema(field: FormField): Record<string, unknown> {
  const typeMap: Record<FormField["type"], string> = {
    text: "string",
    email: "string",
    tel: "string",
    textarea: "string",
    select: "string",
    radio: "string",
    checkbox: "boolean",
    number: "number",
  };

  return {
    title: field.label,
    type: typeMap[field.type],
  };
}

function schemaFromSteps(steps: FormStep[]): Record<string, unknown> {
  const fields = steps.flatMap((step) => step.fields);
  const required = fields.filter((field) => field.required).map((field) => field.name);
  return {
    type: "object",
    required,
    properties: Object.fromEntries(fields.map((field) => [field.name, fieldSchema(field)])),
  };
}

function sectionNeedsLeadCapture(section: LandingPageSection): boolean {
  return (
    section.type === "lead_form" ||
    (section.type === "hero" && (section.variant ?? "centered") === "split-form-right")
  );
}

export function compositionHasLeadCapture(composition?: LandingPageComposition | null): boolean {
  if (!composition) return false;
  if (composition.sections.some(sectionNeedsLeadCapture)) return true;
  return (
    composition.site?.pages?.some((page) => page.sections.some(sectionNeedsLeadCapture)) ?? false
  );
}

export function buildAutoLandingFormDefinition(input: {
  locale?: string | null;
  vertical?: string | null;
  goal?: string | null;
  composition?: LandingPageComposition | null;
  captureChannels?: readonly string[] | null;
}): AutoLandingFormDefinition {
  const locale = normalizeLocale(input.locale);
  const copy = COPY_BY_LOCALE[locale];
  const kind = inferLeadFormKind(input);
  const captureChannels = normalizeLeadCaptureChannels(input.captureChannels, kind);
  const includeEmail = captureChannels.includes("email");
  const includePhone = channelsNeedPhone(captureChannels);

  const baseContactStep: FormStep = {
    title:
      kind === "booking"
        ? copy.booking.stepOneTitle
        : kind === "callback"
          ? copy.callback.stepOneTitle
          : copy.quote.stepOneTitle,
    fields: [
      {
        name: "name",
        label: copy.common.nameLabel,
        type: "text",
        required: true,
      },
      ...(includeEmail
        ? [
            {
              name: "email",
              label: copy.common.emailLabel,
              type: "email" as const,
              required: !includePhone,
            },
          ]
        : []),
      ...(includePhone
        ? [
            {
              name: "phone",
              label: copy.common.phoneLabel,
              type: "tel" as const,
              required: true,
            },
          ]
        : []),
      ...(captureChannels.length > 1
        ? [
            {
              name: "preferred_channel",
              label: copy.common.preferredChannelLabel,
              type: "radio" as const,
              required: false,
              options: preferredChannelOptions(captureChannels, copy),
            },
          ]
        : []),
    ],
  };

  const steps: FormStep[] =
    kind === "booking"
      ? [
          baseContactStep,
          {
            title: copy.booking.stepTwoTitle,
            fields: [
              {
                name: "date",
                label: copy.booking.dateLabel,
                type: "text",
                required: true,
              },
              {
                name: "time",
                label: copy.booking.timeLabel,
                type: "text",
                required: false,
              },
              {
                name: "party_size",
                label: copy.booking.guestsLabel,
                type: "number",
                required: false,
                min: 1,
                max: 50,
              },
              {
                name: "message",
                label: copy.booking.messageLabel,
                type: "textarea",
                required: false,
                placeholder: copy.booking.messagePlaceholder,
              },
            ],
          },
        ]
      : kind === "callback"
        ? [
            baseContactStep,
            {
              title: copy.callback.stepTwoTitle,
              fields: [
                {
                  name: "preferred_time",
                  label: copy.callback.preferredTimeLabel,
                  type: "text",
                  required: false,
                  placeholder: copy.callback.preferredTimePlaceholder,
                },
                {
                  name: "message",
                  label: copy.callback.messageLabel,
                  type: "textarea",
                  required: false,
                  placeholder: copy.callback.messagePlaceholder,
                },
              ],
            },
          ]
        : [
            baseContactStep,
            {
              title: copy.quote.stepTwoTitle,
              fields: [
                {
                  name: "service",
                  label: copy.quote.serviceLabel,
                  type: "text",
                  required: false,
                  placeholder: copy.quote.servicePlaceholder,
                },
                {
                  name: "message",
                  label: copy.quote.messageLabel,
                  type: "textarea",
                  required: false,
                  placeholder: copy.quote.messagePlaceholder,
                },
              ],
            },
          ];

  const settings: FormSettings = {
    honeypot: true,
    turnstile_enabled: false,
    success_message:
      kind === "booking"
        ? copy.booking.successMessage
        : kind === "callback"
          ? copy.callback.successMessage
          : copy.quote.successMessage,
  };

  return {
    kind,
    name:
      kind === "booking"
        ? copy.booking.name
        : kind === "callback"
          ? copy.callback.name
          : copy.quote.name,
    submitLabel:
      kind === "booking"
        ? copy.booking.submitLabel
        : kind === "callback"
          ? copy.callback.submitLabel
          : copy.quote.submitLabel,
    settings,
    steps,
    schema: schemaFromSteps(steps),
    captureChannels,
  };
}
