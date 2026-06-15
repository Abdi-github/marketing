import type {
  LandingPageComposition,
  LandingPageNavStyle,
  LandingPageSection,
  LandingPageSite,
  LandingPageSiteLink,
  LandingPageSitePage,
  SectionType,
} from "./landing-page.schema";
import {
  computeSectionRhythm,
  pickDesignRecipe,
  type DesignRecipePlanSignals,
  type Vibe,
} from "./design-recipe";

export type WebsiteCompositionInput = {
  businessName: string;
  vertical: string;
  city?: string;
  locale: string;
  goals?: string[] | null;
  vibe?: Partial<Vibe> | null;
  seed: string;
  navStyle?: LandingPageNavStyle | null;
  designPlan?: (DesignRecipePlanSignals & { navStyle?: LandingPageNavStyle | null }) | null;
};

type Labels = {
  home: string;
  about: string;
  services: string;
  servicesSlug: "menu" | "products" | "services";
  contact: string;
  cta: string;
  aboutTitle: string;
  servicesTitle: string;
  contactTitle: string;
  aboutBody: string;
  servicesBody: string;
  contactBody: string;
  offerHeading: string;
  offerBody: string;
  faqHeading: string;
  faqBody: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function verticalKind(
  vertical: string,
): "hospitality" | "retail" | "clinic" | "fitness" | "service" {
  const text = normalizeText(vertical);
  if (/cafe|coffee|restaurant|bistro|bar|bakery|brunch|pizza|trattoria/.test(text)) {
    return "hospitality";
  }
  if (/retail|shop|store|boutique|fashion|product|jewel|watch|market/.test(text)) {
    return "retail";
  }
  if (/clinic|doctor|dental|dentist|physio|praxis|health|care|therapy/.test(text)) {
    return "clinic";
  }
  if (/fitness|gym|yoga|pilates|sport|training|wellness|spa/.test(text)) {
    return "fitness";
  }
  return "service";
}

function serviceMeta(input: WebsiteCompositionInput): {
  slug: Labels["servicesSlug"];
  en: string;
  de: string;
  fr: string;
  it: string;
} {
  const kind = verticalKind(input.vertical);
  if (kind === "hospitality") {
    return { slug: "menu", en: "Menu", de: "Menu", fr: "Menu", it: "Menu" };
  }
  if (kind === "retail") {
    return {
      slug: "products",
      en: "Products",
      de: "Produkte",
      fr: "Produits",
      it: "Prodotti",
    };
  }
  return {
    slug: "services",
    en: "Services",
    de: "Angebot",
    fr: "Services",
    it: "Servizi",
  };
}

function labelsForLocale(input: WebsiteCompositionInput): Labels {
  const city = input.city ? ` in ${input.city}` : "";
  const name = input.businessName;
  const locale = input.locale.toLowerCase();
  const service = serviceMeta(input);

  if (locale.startsWith("fr")) {
    return {
      home: "Accueil",
      about: "A propos",
      services: service.fr,
      servicesSlug: service.slug,
      contact: "Contact",
      cta: "Demander une offre",
      aboutTitle: `A propos de ${name}`,
      servicesTitle: `${service.fr} de ${name}`,
      contactTitle: `Contacter ${name}`,
      aboutBody: `${name} associe une expertise locale${city} a une experience claire, soignee et facile a reserver.`,
      servicesBody: `Decouvrez les offres, specialites et options les plus utiles pour choisir rapidement ce qui vous convient.`,
      contactBody: `Posez une question, demandez une offre ou reservez un rendez-vous. L'equipe vous repond rapidement.`,
      offerHeading: "Offre recommandee",
      offerBody: "Une selection claire pour transformer l'interet en prochaine etape concrete.",
      faqHeading: "Questions frequentes",
      faqBody: "Les reponses essentielles avant de reserver ou de prendre contact.",
    };
  }

  if (locale.startsWith("it")) {
    return {
      home: "Home",
      about: "Chi siamo",
      services: service.it,
      servicesSlug: service.slug,
      contact: "Contatto",
      cta: "Richiedi un'offerta",
      aboutTitle: `Chi e ${name}`,
      servicesTitle: `${service.it} di ${name}`,
      contactTitle: `Contatta ${name}`,
      aboutBody: `${name} unisce competenza locale${city} a un'esperienza chiara, curata e semplice da prenotare.`,
      servicesBody:
        "Scopri le offerte, le specialita e le opzioni piu utili per scegliere con sicurezza.",
      contactBody:
        "Fai una domanda, richiedi un'offerta o prenota un appuntamento. Il team risponde rapidamente.",
      offerHeading: "Offerta consigliata",
      offerBody: "Una proposta chiara per trasformare l'interesse nel prossimo passo concreto.",
      faqHeading: "Domande frequenti",
      faqBody: "Le risposte essenziali prima di prenotare o contattarci.",
    };
  }

  if (locale.startsWith("de")) {
    return {
      home: "Start",
      about: "Ueber uns",
      services: service.de,
      servicesSlug: service.slug,
      contact: "Kontakt",
      cta: "Anfrage senden",
      aboutTitle: `Ueber ${name}`,
      servicesTitle: `${service.de} von ${name}`,
      contactTitle: `${name} kontaktieren`,
      aboutBody: `${name} verbindet lokale Erfahrung${city} mit einem klaren, hochwertigen und einfach buchbaren Kundenerlebnis.`,
      servicesBody:
        "Entdecken Sie die wichtigsten Angebote, Spezialitaeten und Optionen, um schnell die passende Wahl zu treffen.",
      contactBody:
        "Stellen Sie eine Frage, fordern Sie ein Angebot an oder vereinbaren Sie einen Termin. Das Team meldet sich zeitnah.",
      offerHeading: "Empfohlenes Angebot",
      offerBody: "Ein klares Angebot, das Interesse in den naechsten konkreten Schritt verwandelt.",
      faqHeading: "Haeufige Fragen",
      faqBody: "Die wichtigsten Antworten, bevor Sie buchen oder Kontakt aufnehmen.",
    };
  }

  return {
    home: "Home",
    about: "About",
    services: service.en,
    servicesSlug: service.slug,
    contact: "Contact",
    cta: "Request quote",
    aboutTitle: `About ${name}`,
    servicesTitle: `${name} ${service.en.toLowerCase()}`,
    contactTitle: `Contact ${name}`,
    aboutBody: `${name} combines local expertise${city} with a polished, easy-to-book customer experience.`,
    servicesBody:
      "Explore the key offers, specialties, and options so visitors can choose the right next step quickly.",
    contactBody:
      "Ask a question, request a quote, or book an appointment. The team will get back to you quickly.",
    offerHeading: "Recommended offer",
    offerBody: "A clear offer that turns interest into the next concrete step.",
    faqHeading: "Common questions",
    faqBody: "The essential answers before booking or getting in touch.",
  };
}

function cloneExtras<T>(extras: T): T {
  if (extras == null) return extras;
  return JSON.parse(JSON.stringify(extras)) as T;
}

function cloneSection(section: LandingPageSection, order: number): LandingPageSection {
  return {
    ...section,
    order,
    extras: cloneExtras(section.extras),
  } as LandingPageSection;
}

function findSection<T extends LandingPageSection["type"]>(
  sections: LandingPageSection[],
  type: T,
): Extract<LandingPageSection, { type: T }> | undefined {
  return sections.find(
    (section): section is Extract<LandingPageSection, { type: T }> => section.type === type,
  );
}

function makeHero(
  order: number,
  heading: string,
  body: string,
  ctaText: string,
  ctaHref: string,
): LandingPageSection {
  return {
    type: "hero",
    order,
    heading,
    body,
    variant: "split-image-right",
    extras: { ctaText, ctaHref },
  };
}

function makeAbout(order: number, labels: Labels): LandingPageSection {
  return {
    type: "about",
    order,
    heading: labels.aboutTitle,
    body: labels.aboutBody,
    variant: "values-3col",
    extras: {
      values: [labels.services, labels.contact, labels.cta],
    },
  };
}

function makeOffer(order: number, labels: Labels): LandingPageSection {
  return {
    type: "offer",
    order,
    heading: labels.offerHeading,
    body: labels.offerBody,
    variant: "split-image-price",
    extras: { ctaText: labels.cta, ctaHref: "./contact" },
  };
}

function makeFaq(order: number, labels: Labels): LandingPageSection {
  return {
    type: "faq",
    order,
    heading: labels.faqHeading,
    body: labels.faqBody,
    variant: "two-column",
    extras: {
      items: [
        { question: labels.cta, answer: labels.contactBody },
        { question: labels.services, answer: labels.servicesBody },
      ],
    },
  };
}

function makeContact(order: number, labels: Labels): LandingPageSection {
  return {
    type: "contact",
    order,
    heading: labels.contactTitle,
    body: labels.contactBody,
    variant: "cards-row",
  };
}

function makeLeadForm(order: number, labels: Labels): LandingPageSection {
  return {
    type: "lead_form",
    order,
    heading: labels.cta,
    body: labels.contactBody,
    variant: "card-centered",
    extras: {},
  };
}

function serviceSectionFor(homeSections: LandingPageSection[], labels: Labels): LandingPageSection {
  return (
    findSection(homeSections, "menu_preview") ??
    findSection(homeSections, "offer") ??
    findSection(homeSections, "faq") ??
    makeOffer(1, labels)
  );
}

function withDesignRhythm(
  sections: LandingPageSection[],
  input: WebsiteCompositionInput,
  pageSeed: string,
): LandingPageSection[] {
  const ordered = sections.map((section, index) => cloneSection(section, index));
  const recipe = pickDesignRecipe({
    vibe: input.vibe ?? null,
    goals: input.goals ?? [],
    seed: `${input.seed}|${pageSeed}`,
    sectionTypes: ordered.map((section) => section.type),
    designPlan: input.designPlan ?? null,
  });

  const withVariants = ordered.map((section) => ({
    ...section,
    variant: recipe.variants[section.type as SectionType] ?? section.variant,
  })) as LandingPageSection[];

  const tones = computeSectionRhythm(
    withVariants.map((section) => ({
      type: section.type,
      variant: section.variant,
    })),
  );

  return withVariants.map((section, index) =>
    tones[index] ? { ...section, tone: tones[index] } : { ...section, tone: undefined },
  ) as LandingPageSection[];
}

function buildAboutPage(
  homeSections: LandingPageSection[],
  labels: Labels,
  input: WebsiteCompositionInput,
) {
  const sections = [
    makeHero(0, labels.aboutTitle, labels.aboutBody, labels.cta, "./contact"),
    findSection(homeSections, "about") ?? makeAbout(1, labels),
    findSection(homeSections, "testimonials") ?? makeFaq(2, labels),
  ];

  return {
    slug: "about",
    title: labels.aboutTitle,
    description: labels.aboutBody,
    sections: withDesignRhythm(sections, input, "about"),
  };
}

function buildServicesPage(
  homeSections: LandingPageSection[],
  labels: Labels,
  input: WebsiteCompositionInput,
) {
  const sections = [
    makeHero(0, labels.servicesTitle, labels.servicesBody, labels.cta, "./contact"),
    serviceSectionFor(homeSections, labels),
    findSection(homeSections, "gallery") ?? makeOffer(2, labels),
    findSection(homeSections, "faq") ?? makeFaq(3, labels),
  ];

  return {
    slug: labels.servicesSlug,
    title: labels.servicesTitle,
    description: labels.servicesBody,
    sections: withDesignRhythm(sections, input, "services"),
  };
}

function buildContactPage(
  homeSections: LandingPageSection[],
  labels: Labels,
  input: WebsiteCompositionInput,
) {
  const sections = [
    makeHero(0, labels.contactTitle, labels.contactBody, labels.cta, "#lead-form"),
    findSection(homeSections, "contact") ?? makeContact(1, labels),
    findSection(homeSections, "lead_form") ??
      findSection(homeSections, "whatsapp_cta") ??
      makeLeadForm(2, labels),
  ];

  return {
    slug: "contact",
    title: labels.contactTitle,
    description: labels.contactBody,
    sections: withDesignRhythm(sections, input, "contact"),
  };
}

function navLinks(labels: Labels): LandingPageSiteLink[] {
  return [
    { label: labels.home, pageSlug: "home" },
    { label: labels.about, pageSlug: "about" },
    { label: labels.services, pageSlug: labels.servicesSlug },
    { label: labels.contact, pageSlug: "contact" },
  ];
}

function navStyleFor(input: WebsiteCompositionInput): LandingPageNavStyle {
  return input.navStyle ?? input.designPlan?.navStyle ?? "classic";
}

function isUsablePage(page: LandingPageSitePage | undefined): page is LandingPageSitePage {
  return !!page && page.sections.length >= 2;
}

function linkResolves(link: LandingPageSiteLink, pageSlugs: Set<string>): boolean {
  if (link.href || link.sectionId) return true;
  if (!link.pageSlug || link.pageSlug === "home") return true;
  return pageSlugs.has(link.pageSlug);
}

export function hasValidWebsiteShell(composition: LandingPageComposition): boolean {
  const site = composition.site;
  if (!site || site.mode !== "website" || !site.nav || !site.nav.links.length) return false;
  if (!site.footer) return false;
  const pages = site.pages ?? [];
  if (pages.length < 3) return false;
  const pageSlugs = new Set(pages.filter(isUsablePage).map((page) => page.slug));
  if (pageSlugs.size < 3) return false;
  return [...site.nav.links, site.nav.cta]
    .filter((link): link is LandingPageSiteLink => !!link)
    .every((link) => linkResolves(link, pageSlugs));
}

export function enhanceCompositionWithWebsite(
  composition: LandingPageComposition,
  input: WebsiteCompositionInput,
): LandingPageComposition {
  const labels = labelsForLocale(input);
  const style = navStyleFor(input);
  if (hasValidWebsiteShell(composition)) {
    return {
      ...composition,
      site: composition.site
        ? {
            ...composition.site,
            nav: composition.site.nav
              ? { ...composition.site.nav, style: composition.site.nav.style ?? style }
              : composition.site.nav,
          }
        : composition.site,
    };
  }

  const homeSections = composition.sections.slice().sort((a, b) => a.order - b.order);
  const generatedPages = [
    buildAboutPage(homeSections, labels, input),
    buildServicesPage(homeSections, labels, input),
    buildContactPage(homeSections, labels, input),
  ];
  const existingPages = new Map(
    (composition.site?.pages ?? []).filter(isUsablePage).map((page) => [page.slug, page]),
  );
  const pages = generatedPages.map((page) => existingPages.get(page.slug) ?? page);

  const links = navLinks(labels);
  const site: LandingPageSite = {
    mode: "website",
    nav: {
      style,
      brandLabel: input.businessName,
      links,
      cta: { label: labels.cta, pageSlug: "contact" },
    },
    pages,
    footer: {
      text: `© ${new Date().getFullYear()} ${input.businessName}`,
      links: links.slice(1),
    },
  };

  return { ...composition, site };
}
