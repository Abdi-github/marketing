import type { LandingPageComposition, LandingPageSection } from "@marketing/ai-router";
import type { FormField, FormSettings, FormStep } from "@marketing/ai-router/form-schema";

type SupportedLocale = "de-CH" | "fr-CH" | "it-CH" | "en";
type LandingFormKind = "quote" | "booking";

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
};

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
}): AutoLandingFormDefinition {
  const locale = normalizeLocale(input.locale);
  const copy = COPY_BY_LOCALE[locale];
  const kind: LandingFormKind = looksLikeBookingVertical(input.vertical) ? "booking" : "quote";

  const baseContactStep: FormStep = {
    title: kind === "booking" ? copy.booking.stepOneTitle : copy.quote.stepOneTitle,
    fields: [
      {
        name: "name",
        label: copy.common.nameLabel,
        type: "text",
        required: true,
      },
      {
        name: "email",
        label: copy.common.emailLabel,
        type: "email",
        required: true,
      },
      {
        name: "phone",
        label: copy.common.phoneLabel,
        type: "tel",
        required: kind === "booking",
      },
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
    success_message: kind === "booking" ? copy.booking.successMessage : copy.quote.successMessage,
  };

  return {
    kind,
    name: kind === "booking" ? copy.booking.name : copy.quote.name,
    submitLabel: kind === "booking" ? copy.booking.submitLabel : copy.quote.submitLabel,
    settings,
    steps,
    schema: schemaFromSteps(steps),
  };
}
