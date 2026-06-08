#!/usr/bin/env tsx
/**
 * LP-2 seed: rich multilingual templates with real copy, themes, image bundles.
 *
 * Run with: DATABASE_URL=... tsx packages/db/scripts/seed-landing-templates-v2.ts
 *
 * Idempotent: uses `ON CONFLICT (key) DO UPDATE` so re-running upgrades existing rows in place.
 *
 * Authored in DE-CH + EN at definition time. FR-CH + IT-CH translations land via:
 *   tsx packages/db/scripts/translate-templates.ts (built in LP-2 task 9)
 */
import { db } from "../src";
import { landingPageTemplates } from "../src/schema";
import {
  defineTemplate,
  buildUnsplashUrl,
  IMAGE_BUNDLES_BY_KEY,
} from "../../landing-design-system/src";
import type { TemplateDefinition } from "../../landing-design-system/src";

// ─── Image helpers ─────────────────────────────────────────────────────────────
// Pull photos from a bundle by role; build URLs at definition time.

function img(bundleKey: string, role: "hero" | "gallery" | "lifestyle" | "detail" | "avatar", index = 0, width = 1600) {
  const bundle = IMAGE_BUNDLES_BY_KEY.get(bundleKey);
  if (!bundle) throw new Error(`No image bundle: ${bundleKey}`);
  const matches = bundle.photos.filter((p) => p.role === role);
  if (matches.length === 0) {
    // Fall back to first photo in bundle if no exact role match
    return buildUnsplashUrl(bundle.photos[0]!.id, { width });
  }
  return buildUnsplashUrl(matches[index % matches.length]!.id, { width });
}

// ─── 1. Café — warm-roasted (elegant) ────────────────────────────────────────────

const CAFE_WARM_ROASTED_ELEGANT: TemplateDefinition = defineTemplate({
  key: "cafe-warm-roasted-elegant",
  vertical: "cafe",
  style: "elegant",
  goal: "lead_capture",
  themeKey: "warm-roasted",
  imageBundleKey: "cafe-warm-brunch",
  swissSpecific: false,
  nameKey: "templates.cafeWarmRoasted.name",
  descriptionKey: "templates.cafeWarmRoasted.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Spezialitätenkaffee mit Charakter",
        body: "Direkt geröstete Bohnen, gebrüht mit Sorgfalt. Mitten in der Stadt — der Ort, an dem Ihr Tag beginnt.",
        extras: {
          ctaText: "Tisch reservieren",
          ctaHref: "#kontakt",
          backgroundImageUrl: img("cafe-warm-brunch", "hero", 0, 1920),
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "Vom Rohbohnen-Sortieren bis in Ihre Tasse",
        body: "Wir arbeiten direkt mit Kaffeefarmern in Äthiopien und Kolumbien zusammen. Jede Bohne wird in unserer hauseigenen Trommelröstung verarbeitet — keine Kompromisse. Im Schnitt sieben Tage von der Röstung bis zum Espresso.",
        extras: { imageUrl: img("cafe-warm-brunch", "lifestyle", 0, 1600) },
      },
      {
        type: "menu_preview",
        order: 2,
        variant: "list-borders",
        heading: "Unsere Karte",
        body: "Eine kleine Auswahl. Die ganze Karte erwartet Sie vor Ort.",
        extras: {
          items: [
            { name: "Espresso", price: "CHF 4.50", description: "Single Origin, Tagesröstung" },
            { name: "Cortado", price: "CHF 5.20", description: "Espresso mit warmer Milch" },
            { name: "Filterkaffee", price: "CHF 6.00", description: "V60 oder Chemex — fragen Sie unser Team" },
            { name: "Hausgemachter Bananenkuchen", price: "CHF 7.50", description: "Glutenfrei, frisch jeden Morgen" },
            { name: "Avocado Toast", price: "CHF 14.50", description: "Sauerteigbrot, pochiertes Ei, Mikrokräuter" },
          ],
        },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "Was unsere Gäste sagen",
        body: "",
        extras: {
          items: [
            {
              quote: "Der beste Cortado in Zürich. Keine Frage. Und das Team merkt sich, was man gerne bestellt.",
              author: "Sarah M.",
              role: "Stammgast",
              avatarUrl: img("cafe-warm-brunch", "avatar", 0, 200),
            },
            {
              quote: "Ich komme jeden Morgen vor dem Büro. Ruhige Atmosphäre, ehrlicher Kaffee, freundliche Menschen.",
              author: "Marco B.",
              role: "Kreuzplatz",
              avatarUrl: img("cafe-warm-brunch", "avatar", 1, 200),
            },
            {
              quote: "Endlich ein Café, das den Brunch ernst nimmt. Sonntags ein Pflichttermin.",
              author: "Lisa K.",
              role: "Brunch-Liebhaberin",
              avatarUrl: img("cafe-warm-brunch", "avatar", 0, 200),
            },
          ],
        },
      },
      {
        type: "gallery",
        order: 4,
        variant: "masonry-3",
        heading: "Einblicke",
        body: "",
        extras: {
          images: [
            { url: img("cafe-warm-brunch", "gallery", 0, 1200), caption: "Latte Art" },
            { url: img("cafe-warm-brunch", "gallery", 1, 1200), caption: "Brunch-Tisch" },
            { url: img("cafe-warm-brunch", "gallery", 2, 1200), caption: "Croissants" },
            { url: img("cafe-warm-brunch", "gallery", 3, 1200), caption: "Geröstete Bohnen" },
            { url: img("cafe-warm-brunch", "lifestyle", 0, 1200), caption: "Gemeinsam geniessen" },
          ],
        },
      },
      {
        type: "lead_form",
        order: 5,
        variant: "card-centered",
        heading: "Reservieren Sie Ihren Tisch",
        body: "Geben Sie uns Bescheid, wann Sie vorbeikommen. Wir freuen uns auf Sie.",
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Specialty Coffee with Character",
        body: "Roasted in-house, brewed with care. Right in the city — where your day begins.",
        extras: {
          ctaText: "Reserve a Table",
          ctaHref: "#contact",
          backgroundImageUrl: img("cafe-warm-brunch", "hero", 0, 1920),
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "From Green Bean to Your Cup",
        body: "We work directly with coffee farmers in Ethiopia and Colombia. Every bean is processed in our in-house drum roaster — no compromises. Seven days on average from roast to espresso.",
        extras: { imageUrl: img("cafe-warm-brunch", "lifestyle", 0, 1600) },
      },
      {
        type: "menu_preview",
        order: 2,
        variant: "list-borders",
        heading: "Our Menu",
        body: "A small selection. The full menu awaits you in person.",
        extras: {
          items: [
            { name: "Espresso", price: "CHF 4.50", description: "Single origin, daily roast" },
            { name: "Cortado", price: "CHF 5.20", description: "Espresso with warm milk" },
            { name: "Filter Coffee", price: "CHF 6.00", description: "V60 or Chemex — ask our team" },
            { name: "Homemade Banana Bread", price: "CHF 7.50", description: "Gluten-free, freshly baked daily" },
            { name: "Avocado Toast", price: "CHF 14.50", description: "Sourdough, poached egg, micro herbs" },
          ],
        },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "What Our Guests Say",
        body: "",
        extras: {
          items: [
            {
              quote: "The best cortado in Zurich. No question. And the team remembers what you usually order.",
              author: "Sarah M.",
              role: "Regular",
              avatarUrl: img("cafe-warm-brunch", "avatar", 0, 200),
            },
            {
              quote: "I come every morning before the office. Quiet atmosphere, honest coffee, friendly people.",
              author: "Marco B.",
              role: "Kreuzplatz",
              avatarUrl: img("cafe-warm-brunch", "avatar", 1, 200),
            },
            {
              quote: "Finally a café that takes brunch seriously. A must-visit on Sundays.",
              author: "Lisa K.",
              role: "Brunch lover",
              avatarUrl: img("cafe-warm-brunch", "avatar", 0, 200),
            },
          ],
        },
      },
      {
        type: "gallery",
        order: 4,
        variant: "masonry-3",
        heading: "Inside the Café",
        body: "",
        extras: {
          images: [
            { url: img("cafe-warm-brunch", "gallery", 0, 1200), caption: "Latte art" },
            { url: img("cafe-warm-brunch", "gallery", 1, 1200), caption: "Brunch table" },
            { url: img("cafe-warm-brunch", "gallery", 2, 1200), caption: "Croissants" },
            { url: img("cafe-warm-brunch", "gallery", 3, 1200), caption: "Roasted beans" },
            { url: img("cafe-warm-brunch", "lifestyle", 0, 1200), caption: "Together" },
          ],
        },
      },
      {
        type: "lead_form",
        order: 5,
        variant: "card-centered",
        heading: "Reserve Your Table",
        body: "Let us know when you'll come by. We look forward to seeing you.",
      },
    ],
  },
});

// ─── 2. Restaurant — fine dining (elegant) ──────────────────────────────────────

const RESTAURANT_FINE_DINING_ELEGANT: TemplateDefinition = defineTemplate({
  key: "restaurant-fine-dining-elegant",
  vertical: "restaurant",
  style: "elegant",
  goal: "appointment_booking",
  themeKey: "burgundy-velvet",
  imageBundleKey: "restaurant-fine-dining",
  swissSpecific: false,
  nameKey: "templates.restaurantFineDining.name",
  descriptionKey: "templates.restaurantFineDining.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Saisonale Küche, Schweizer Wurzeln",
        body: "Ein Menü, das sich mit den Jahreszeiten wandelt. Sechs Gänge, jeden Abend neu interpretiert.",
        extras: {
          ctaText: "Tisch reservieren",
          ctaHref: "#reservation",
          backgroundImageUrl: img("restaurant-fine-dining", "hero", 0, 1920),
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "Die Geschichte hinter dem Teller",
        body: "Unser Chef arbeitet ausschliesslich mit Produzenten aus der Region. Vom Bauernhof in Wädenswil bis zum Käser am Vierwaldstättersee — jede Zutat hat einen Namen und ein Gesicht. Das schmeckt man.",
        extras: { imageUrl: img("restaurant-fine-dining", "lifestyle", 0, 1600) },
      },
      {
        type: "offer",
        order: 2,
        variant: "banner-centered",
        heading: "Degustationsmenü",
        body: "Sechs Gänge, Weinbegleitung optional. Mittwoch bis Samstag.",
        extras: {
          price: "CHF 165.–",
          oldPrice: "",
          validUntil: "Reservation empfohlen",
          ctaText: "Jetzt reservieren",
          ctaHref: "#reservation",
        },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "large-quote",
        heading: "Pressestimmen",
        body: "",
        extras: {
          items: [
            {
              quote: "Eines der spannendsten Restaurants in Zürich. Mut zur Reduktion, ohne dabei je langweilig zu werden.",
              author: "NZZ am Sonntag",
              role: "2025",
            },
          ],
        },
      },
      {
        type: "gallery",
        order: 4,
        variant: "masonry-3",
        heading: "Eindrücke",
        body: "",
        extras: {
          images: [
            { url: img("restaurant-fine-dining", "gallery", 0, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 1, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 2, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 3, 1200) },
            { url: img("restaurant-fine-dining", "lifestyle", 0, 1200) },
          ],
        },
      },
      {
        type: "contact",
        order: 5,
        variant: "split-map",
        heading: "Finden Sie uns",
        body: "Wir sind nur zwei Gehminuten vom Bellevue entfernt.",
        extras: {
          email: "reservation@example.ch",
          phone: "+41 44 123 45 67",
          address: "Limmatquai 12, 8001 Zürich",
        },
      },
      {
        type: "lead_form",
        order: 6,
        variant: "card-centered",
        heading: "Reservieren",
        body: "Ihr Wunschtermin? Wir bestätigen innert 24 Stunden.",
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Seasonal Cuisine, Swiss Roots",
        body: "A menu that changes with the seasons. Six courses, reinvented every evening.",
        extras: {
          ctaText: "Reserve a Table",
          ctaHref: "#reservation",
          backgroundImageUrl: img("restaurant-fine-dining", "hero", 0, 1920),
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "The Story Behind the Plate",
        body: "Our chef works exclusively with producers from the region. From the farm in Wädenswil to the cheesemaker on Lake Lucerne — every ingredient has a name and a face. You can taste it.",
        extras: { imageUrl: img("restaurant-fine-dining", "lifestyle", 0, 1600) },
      },
      {
        type: "offer",
        order: 2,
        variant: "banner-centered",
        heading: "Tasting Menu",
        body: "Six courses, wine pairing optional. Wednesday through Saturday.",
        extras: {
          price: "CHF 165",
          oldPrice: "",
          validUntil: "Reservation recommended",
          ctaText: "Reserve Now",
          ctaHref: "#reservation",
        },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "large-quote",
        heading: "Press",
        body: "",
        extras: {
          items: [
            {
              quote: "One of the most exciting restaurants in Zurich. Bold restraint, never boring.",
              author: "NZZ am Sonntag",
              role: "2025",
            },
          ],
        },
      },
      {
        type: "gallery",
        order: 4,
        variant: "masonry-3",
        heading: "Impressions",
        body: "",
        extras: {
          images: [
            { url: img("restaurant-fine-dining", "gallery", 0, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 1, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 2, 1200) },
            { url: img("restaurant-fine-dining", "gallery", 3, 1200) },
            { url: img("restaurant-fine-dining", "lifestyle", 0, 1200) },
          ],
        },
      },
      {
        type: "contact",
        order: 5,
        variant: "split-map",
        heading: "Find Us",
        body: "Two minutes' walk from Bellevue.",
        extras: {
          email: "reservation@example.ch",
          phone: "+41 44 123 45 67",
          address: "Limmatquai 12, 8001 Zürich",
        },
      },
      {
        type: "lead_form",
        order: 6,
        variant: "card-centered",
        heading: "Reserve",
        body: "Your preferred date? We confirm within 24 hours.",
      },
    ],
  },
});

// ─── 3. Fitness — bright gym (bold) ─────────────────────────────────────────────

const FITNESS_BRIGHT_GYM_BOLD: TemplateDefinition = defineTemplate({
  key: "fitness-bright-gym-bold",
  vertical: "fitness",
  style: "bold",
  goal: "sales_promo",
  themeKey: "sport-orange",
  imageBundleKey: "fitness-bright-gym",
  swissSpecific: false,
  nameKey: "templates.fitnessBrightGym.name",
  descriptionKey: "templates.fitnessBrightGym.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "split-form-right",
        heading: "Stark werden. Dranbleiben. Erfolg sehen.",
        body: "Funktionelles Training in einer Atmosphäre, die motiviert. Persönliche Betreuung — keine Massenabfertigung.",
        extras: {
          ctaText: "Probetraining buchen",
          ctaHref: "#anmeldung",
          backgroundImageUrl: img("fitness-bright-gym", "hero", 0, 1920),
        },
      },
      {
        type: "offer",
        order: 1,
        variant: "split-image-price",
        heading: "Sommer-Aktion: erstes Monat 50% Rabatt",
        body: "Mitgliedschaft inklusive aller Kurse, freie Trainerstunden und Sauna. Kündbar monatlich.",
        extras: {
          price: "CHF 64.–",
          oldPrice: "CHF 128.–",
          validUntil: "Aktion gültig bis 31. August",
          ctaText: "Jetzt Aktion sichern",
          ctaHref: "#anmeldung",
        },
      },
      {
        type: "about",
        order: 2,
        variant: "values-3col",
        heading: "Was uns ausmacht",
        body: "Drei Säulen, die Sie bei uns finden — und sonst kaum anderswo.",
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "Mitglieder über uns",
        body: "",
        extras: {
          items: [
            {
              quote: "In sechs Monaten 12 kg verloren — und ich gehe immer noch gerne hin. Das sagt alles.",
              author: "Andrea S.",
              role: "Mitglied seit 2024",
              avatarUrl: img("fitness-bright-gym", "avatar", 0, 200),
            },
            {
              quote: "Endlich Trainer, die zuhören. Mein Knie macht mir keine Probleme mehr.",
              author: "Marco F.",
              role: "Mitglied seit 2023",
              avatarUrl: img("fitness-bright-gym", "avatar", 1, 200),
            },
            {
              quote: "Die Gruppenenergie ist ansteckend. Ich komme dreimal pro Woche.",
              author: "Nicole B.",
              role: "Mitglied seit 2025",
              avatarUrl: img("fitness-bright-gym", "avatar", 0, 200),
            },
          ],
        },
      },
      {
        type: "faq",
        order: 4,
        variant: "accordion",
        heading: "Häufige Fragen",
        body: "",
        extras: {
          items: [
            { question: "Brauche ich Vorerfahrung?", answer: "Nein. Jedes Probetraining startet mit einer 30-minütigen Einführung. Wir treffen Sie dort, wo Sie stehen." },
            { question: "Wie lange dauert ein Training?", answer: "45 bis 60 Minuten, je nach Kurs. Open Gym ohne Zeitlimit." },
            { question: "Kann ich monatlich kündigen?", answer: "Ja. Keine Mindestlaufzeit nach den ersten 3 Monaten." },
            { question: "Gibt es Duschen und Schliessfächer?", answer: "Selbstverständlich. Inklusive Sauna und Erholungsbereich." },
          ],
        },
      },
      {
        type: "lead_form",
        order: 5,
        variant: "card-centered",
        heading: "Probetraining vereinbaren",
        body: "Erstes Training kostenlos. Wir melden uns innert 24 Stunden mit einem Termin.",
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "split-form-right",
        heading: "Get Strong. Stay With It. See Results.",
        body: "Functional training in an atmosphere that motivates. Personal coaching — never mass-handled.",
        extras: {
          ctaText: "Book Trial Training",
          ctaHref: "#signup",
          backgroundImageUrl: img("fitness-bright-gym", "hero", 0, 1920),
        },
      },
      {
        type: "offer",
        order: 1,
        variant: "split-image-price",
        heading: "Summer Special: First Month 50% Off",
        body: "Membership includes all classes, free trainer hours, and sauna. Monthly cancellation.",
        extras: {
          price: "CHF 64",
          oldPrice: "CHF 128",
          validUntil: "Offer valid until August 31",
          ctaText: "Claim Offer Now",
          ctaHref: "#signup",
        },
      },
      {
        type: "about",
        order: 2,
        variant: "values-3col",
        heading: "What Makes Us Different",
        body: "Three pillars you'll find with us — and rarely elsewhere.",
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "Members on Us",
        body: "",
        extras: {
          items: [
            {
              quote: "Lost 12 kg in six months — and I still enjoy going. That says it all.",
              author: "Andrea S.",
              role: "Member since 2024",
              avatarUrl: img("fitness-bright-gym", "avatar", 0, 200),
            },
            {
              quote: "Finally trainers who listen. My knee no longer gives me trouble.",
              author: "Marco F.",
              role: "Member since 2023",
              avatarUrl: img("fitness-bright-gym", "avatar", 1, 200),
            },
            {
              quote: "The group energy is contagious. I come three times a week.",
              author: "Nicole B.",
              role: "Member since 2025",
              avatarUrl: img("fitness-bright-gym", "avatar", 0, 200),
            },
          ],
        },
      },
      {
        type: "faq",
        order: 4,
        variant: "accordion",
        heading: "Common Questions",
        body: "",
        extras: {
          items: [
            { question: "Do I need prior experience?", answer: "No. Every trial training starts with a 30-minute introduction. We meet you where you are." },
            { question: "How long is a training session?", answer: "45 to 60 minutes depending on the class. Open gym has no time limit." },
            { question: "Can I cancel monthly?", answer: "Yes. No minimum term after the first 3 months." },
            { question: "Are showers and lockers available?", answer: "Of course. Including sauna and recovery area." },
          ],
        },
      },
      {
        type: "lead_form",
        order: 5,
        variant: "card-centered",
        heading: "Schedule a Trial",
        body: "First training is free. We'll reach out within 24 hours to confirm a time.",
      },
    ],
  },
});

// ─── 4. Clinic — Alpine Clean (Swiss-coded, minimal) ────────────────────────────

const CLINIC_ALPINE_CLEAN_MINIMAL: TemplateDefinition = defineTemplate({
  key: "clinic-alpine-clean-minimal",
  vertical: "clinic",
  style: "minimal",
  goal: "appointment_booking",
  themeKey: "alpine-clean",
  imageBundleKey: "clinic-calm-wellness",
  swissSpecific: true,
  nameKey: "templates.clinicAlpineClean.name",
  descriptionKey: "templates.clinicAlpineClean.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "centered",
        heading: "Vertrauensvolle Betreuung. Klare Empfehlungen.",
        body: "Hausarzt-Praxis im Herzen von Bern. Termine innerhalb von 48 Stunden — auch für neue Patientinnen und Patienten.",
        extras: {
          ctaText: "Termin vereinbaren",
          ctaHref: "#termin",
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "Über die Praxis",
        body: "Wir nehmen uns Zeit. Standard-Konsultationen sind bei uns 30 Minuten lang — nicht 15. Das macht den Unterschied, den Sie spüren.",
        extras: { imageUrl: img("clinic-calm-wellness", "lifestyle", 0, 1600) },
      },
      {
        type: "faq",
        order: 2,
        variant: "accordion",
        heading: "Häufige Fragen",
        body: "",
        extras: {
          items: [
            { question: "Akzeptieren Sie alle Krankenkassen?", answer: "Ja. Wir rechnen direkt mit allen Schweizer Grundversicherern ab." },
            { question: "Wie lange dauert eine Erstkonsultation?", answer: "30 Minuten. Wir hören zu, bevor wir entscheiden." },
            { question: "Bieten Sie Hausbesuche an?", answer: "Für bestehende Patientinnen und Patienten ab 70 Jahren — ja." },
            { question: "Gibt es eine Wartezeit für neue Patienten?", answer: "Aktuell durchschnittlich 48 Stunden bis zum Erstkontakt." },
          ],
        },
      },
      {
        type: "contact",
        order: 3,
        variant: "split-map",
        heading: "Praxis in Bern",
        body: "Mit dem Tram in 10 Minuten vom Hauptbahnhof erreichbar.",
        extras: {
          email: "praxis@example.ch",
          phone: "+41 31 234 56 78",
          address: "Marktgasse 5, 3011 Bern",
        },
      },
      {
        type: "lead_form",
        order: 4,
        variant: "card-centered",
        heading: "Termin anfragen",
        body: "Wir melden uns am nächsten Werktag mit einem Vorschlag.",
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "centered",
        heading: "Trusted Care. Clear Recommendations.",
        body: "Family practice in the heart of Bern. Appointments within 48 hours — even for new patients.",
        extras: {
          ctaText: "Schedule an Appointment",
          ctaHref: "#appointment",
        },
      },
      {
        type: "about",
        order: 1,
        variant: "text-image-split",
        heading: "About the Practice",
        body: "We take time. Standard consultations with us are 30 minutes — not 15. That's the difference you feel.",
        extras: { imageUrl: img("clinic-calm-wellness", "lifestyle", 0, 1600) },
      },
      {
        type: "faq",
        order: 2,
        variant: "accordion",
        heading: "Frequently Asked Questions",
        body: "",
        extras: {
          items: [
            { question: "Do you accept all health insurers?", answer: "Yes. We bill directly to all Swiss basic insurers." },
            { question: "How long is an initial consultation?", answer: "30 minutes. We listen before we decide." },
            { question: "Do you offer home visits?", answer: "For existing patients aged 70 and over — yes." },
            { question: "Is there a wait time for new patients?", answer: "Currently 48 hours on average to first contact." },
          ],
        },
      },
      {
        type: "contact",
        order: 3,
        variant: "split-map",
        heading: "Practice in Bern",
        body: "10 minutes by tram from the main station.",
        extras: {
          email: "praxis@example.ch",
          phone: "+41 31 234 56 78",
          address: "Marktgasse 5, 3011 Bern",
        },
      },
      {
        type: "lead_form",
        order: 4,
        variant: "card-centered",
        heading: "Request an Appointment",
        body: "We'll get back to you the next business day with a proposed time.",
      },
    ],
  },
});

// ─── 5. Retail — boutique fashion (luxe / elegant) ──────────────────────────────

const RETAIL_BOUTIQUE_FASHION_ELEGANT: TemplateDefinition = defineTemplate({
  key: "retail-boutique-fashion-elegant",
  vertical: "retail",
  style: "elegant",
  goal: "info_brochure",
  themeKey: "champagne-soft",
  imageBundleKey: "retail-boutique-fashion",
  swissSpecific: false,
  nameKey: "templates.retailBoutiqueFashion.name",
  descriptionKey: "templates.retailBoutiqueFashion.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Mode mit Persönlichkeit. Sorgfältig kuratiert.",
        body: "Ausgewählte Marken aus Europa, fair produziert. Keine Massenware — Stücke, die bleiben.",
        extras: {
          ctaText: "Boutique besuchen",
          ctaHref: "#kontakt",
          backgroundImageUrl: img("retail-boutique-fashion", "hero", 0, 1920),
        },
      },
      {
        type: "gallery",
        order: 1,
        variant: "masonry-3",
        heading: "Aktuelle Saison",
        body: "Eine kleine Auswahl. Mehr finden Sie im Laden.",
        extras: {
          images: [
            { url: img("retail-boutique-fashion", "gallery", 0, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 1, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 2, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 3, 1200) },
            { url: img("retail-boutique-fashion", "lifestyle", 0, 1200) },
          ],
        },
      },
      {
        type: "about",
        order: 2,
        variant: "text-image-split",
        heading: "Unsere Philosophie",
        body: "Wir reisen zweimal jährlich nach Italien, Frankreich und Portugal, um die Manufakturen persönlich zu besuchen. Was wir nicht selbst tragen würden, kommt nicht in den Laden.",
        extras: { imageUrl: img("retail-boutique-fashion", "lifestyle", 0, 1600) },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "Stimmen unserer Kundinnen",
        body: "",
        extras: {
          items: [
            { quote: "Persönliche Beratung, ohne dass es aufdringlich wird. Selten geworden.", author: "Bea L.", role: "Stammkundin", avatarUrl: img("retail-boutique-fashion", "avatar", 0, 200) },
            { quote: "Hier finde ich Stücke, die mir niemand anderes zeigt. Lohnenswerter Umweg.", author: "Carla S.", role: "Aarau", avatarUrl: img("retail-boutique-fashion", "avatar", 1, 200) },
            { quote: "Die Qualität spricht für sich. Und der Espresso ist auch gut.", author: "Tina M.", role: "Stammkundin", avatarUrl: img("retail-boutique-fashion", "avatar", 0, 200) },
          ],
        },
      },
      {
        type: "contact",
        order: 4,
        variant: "split-map",
        heading: "Besuchen Sie uns",
        body: "Mitten in der Altstadt. Parkplatz Schlossberg ist 2 Gehminuten entfernt.",
        extras: {
          email: "boutique@example.ch",
          phone: "+41 62 123 45 67",
          address: "Rathausgasse 18, 5000 Aarau",
        },
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "image-bg-overlay",
        heading: "Fashion with Personality. Carefully Curated.",
        body: "Selected brands from Europe, fairly produced. No mass production — pieces that last.",
        extras: {
          ctaText: "Visit the Boutique",
          ctaHref: "#contact",
          backgroundImageUrl: img("retail-boutique-fashion", "hero", 0, 1920),
        },
      },
      {
        type: "gallery",
        order: 1,
        variant: "masonry-3",
        heading: "Current Season",
        body: "A small selection. More in store.",
        extras: {
          images: [
            { url: img("retail-boutique-fashion", "gallery", 0, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 1, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 2, 1200) },
            { url: img("retail-boutique-fashion", "gallery", 3, 1200) },
            { url: img("retail-boutique-fashion", "lifestyle", 0, 1200) },
          ],
        },
      },
      {
        type: "about",
        order: 2,
        variant: "text-image-split",
        heading: "Our Philosophy",
        body: "Twice a year we travel to Italy, France, and Portugal to visit the makers in person. What we wouldn't wear ourselves doesn't make it into the store.",
        extras: { imageUrl: img("retail-boutique-fashion", "lifestyle", 0, 1600) },
      },
      {
        type: "testimonials",
        order: 3,
        variant: "cards-3col",
        heading: "From Our Customers",
        body: "",
        extras: {
          items: [
            { quote: "Personal advice without ever being pushy. A rare thing these days.", author: "Bea L.", role: "Regular customer", avatarUrl: img("retail-boutique-fashion", "avatar", 0, 200) },
            { quote: "I find pieces here no one else shows me. Worth the detour.", author: "Carla S.", role: "Aarau", avatarUrl: img("retail-boutique-fashion", "avatar", 1, 200) },
            { quote: "Quality speaks for itself. The espresso is good too.", author: "Tina M.", role: "Regular customer", avatarUrl: img("retail-boutique-fashion", "avatar", 0, 200) },
          ],
        },
      },
      {
        type: "contact",
        order: 4,
        variant: "split-map",
        heading: "Come See Us",
        body: "Right in the old town. Schlossberg parking is 2 minutes' walk away.",
        extras: {
          email: "boutique@example.ch",
          phone: "+41 62 123 45 67",
          address: "Rathausgasse 18, 5000 Aarau",
        },
      },
    ],
  },
});

// ─── 6. Service — Zürich Modern (Swiss-coded, minimal) ──────────────────────────

const SERVICE_ZURICH_MODERN_MINIMAL: TemplateDefinition = defineTemplate({
  key: "service-zurich-modern-minimal",
  vertical: "service",
  style: "minimal",
  goal: "lead_capture",
  themeKey: "zurich-modern",
  imageBundleKey: "service-consulting-pro",
  swissSpecific: true,
  nameKey: "templates.serviceZurichModern.name",
  descriptionKey: "templates.serviceZurichModern.description",
  availableLocales: ["de-CH", "en"],
  sectionsByLocale: {
    "de-CH": [
      {
        type: "hero",
        order: 0,
        variant: "split-form-right",
        heading: "Steuerberatung für KMU. Persönlich. Direkt.",
        body: "Wir kümmern uns um Ihre Buchhaltung, Mehrwertsteuer und Steuererklärung — damit Sie sich auf Ihr Geschäft konzentrieren können.",
        extras: {
          ctaText: "Erstgespräch buchen",
          ctaHref: "#kontakt",
        },
      },
      {
        type: "about",
        order: 1,
        variant: "values-3col",
        heading: "Was uns auszeichnet",
        body: "Drei Versprechen, die wir seit 12 Jahren halten.",
      },
      {
        type: "testimonials",
        order: 2,
        variant: "cards-3col",
        heading: "Was Mandanten sagen",
        body: "",
        extras: {
          items: [
            { quote: "Endlich ein Treuhänder, der erklärt — und nicht nur abrechnet.", author: "Beat H.", role: "GmbH-Geschäftsführer", avatarUrl: img("service-consulting-pro", "avatar", 0, 200) },
            { quote: "Innert 24 Stunden eine konkrete Antwort. Jedes Mal.", author: "Daniela K.", role: "Einzelfirma", avatarUrl: img("service-consulting-pro", "avatar", 1, 200) },
            { quote: "Bei der Steuerprüfung professionell vertreten. Stress weg.", author: "Marco R.", role: "AG-Inhaber", avatarUrl: img("service-consulting-pro", "avatar", 0, 200) },
          ],
        },
      },
      {
        type: "faq",
        order: 3,
        variant: "accordion",
        heading: "Häufige Fragen",
        body: "",
        extras: {
          items: [
            { question: "Wie hoch sind Ihre Honorare?", answer: "Buchhaltung pauschal ab CHF 290/Monat. Steuererklärung KMU ab CHF 850. Fixe Preise, keine Überraschungen." },
            { question: "Übernehmen Sie auch bestehende Buchhaltungen?", answer: "Ja. Wir übernehmen mitten im Jahr. Übergabe in 2-3 Wochen." },
            { question: "Welche Branchen kennen Sie?", answer: "Hauptsächlich Gastronomie, Bau, IT, Detailhandel — viel Erfahrung mit Mehrwertsteuer-Themen." },
          ],
        },
      },
      {
        type: "lead_form",
        order: 4,
        variant: "card-centered",
        heading: "Kostenloses Erstgespräch",
        body: "30 Minuten, unverbindlich. Wir hören zu und sagen ehrlich, ob wir die richtige Wahl für Sie sind.",
      },
    ],
    en: [
      {
        type: "hero",
        order: 0,
        variant: "split-form-right",
        heading: "Tax Advisory for SMEs. Personal. Direct.",
        body: "We handle your bookkeeping, VAT, and tax returns — so you can focus on your business.",
        extras: {
          ctaText: "Book Initial Consultation",
          ctaHref: "#contact",
        },
      },
      {
        type: "about",
        order: 1,
        variant: "values-3col",
        heading: "What Sets Us Apart",
        body: "Three promises we've kept for 12 years.",
      },
      {
        type: "testimonials",
        order: 2,
        variant: "cards-3col",
        heading: "What Clients Say",
        body: "",
        extras: {
          items: [
            { quote: "Finally a trustee who explains — not just bills.", author: "Beat H.", role: "GmbH Director", avatarUrl: img("service-consulting-pro", "avatar", 0, 200) },
            { quote: "A concrete answer within 24 hours. Every time.", author: "Daniela K.", role: "Sole proprietor", avatarUrl: img("service-consulting-pro", "avatar", 1, 200) },
            { quote: "Professionally represented during a tax audit. Stress gone.", author: "Marco R.", role: "AG Owner", avatarUrl: img("service-consulting-pro", "avatar", 0, 200) },
          ],
        },
      },
      {
        type: "faq",
        order: 3,
        variant: "accordion",
        heading: "Common Questions",
        body: "",
        extras: {
          items: [
            { question: "How much do you charge?", answer: "Bookkeeping from CHF 290/month flat. SME tax return from CHF 850. Fixed pricing, no surprises." },
            { question: "Do you take over existing bookkeeping?", answer: "Yes. We can take over mid-year. Transition takes 2-3 weeks." },
            { question: "What industries do you know?", answer: "Mainly hospitality, construction, IT, retail — extensive VAT experience." },
          ],
        },
      },
      {
        type: "lead_form",
        order: 4,
        variant: "card-centered",
        heading: "Free Initial Consultation",
        body: "30 minutes, no obligation. We listen and tell you honestly whether we're the right fit.",
      },
    ],
  },
});

// ─── Insert ─────────────────────────────────────────────────────────────────────

const ALL_TEMPLATES: readonly TemplateDefinition[] = [
  CAFE_WARM_ROASTED_ELEGANT,
  RESTAURANT_FINE_DINING_ELEGANT,
  FITNESS_BRIGHT_GYM_BOLD,
  CLINIC_ALPINE_CLEAN_MINIMAL,
  RETAIL_BOUTIQUE_FASHION_ELEGANT,
  SERVICE_ZURICH_MODERN_MINIMAL,
];

async function main() {
  console.log(`Seeding ${ALL_TEMPLATES.length} v2 templates...`);

  for (const tpl of ALL_TEMPLATES) {
    await db
      .insert(landingPageTemplates)
      .values({
        key: tpl.key,
        nameKey: tpl.nameKey,
        descriptionKey: tpl.descriptionKey,
        vertical: tpl.vertical,
        style: tpl.style,
        defaultSections: [],
        defaultBrandHints: {},
        sectionsByLocale: tpl.sectionsByLocale as Record<string, unknown>,
        availableLocales: tpl.availableLocales as string[],
        themeKey: tpl.themeKey,
        imageBundleKey: tpl.imageBundleKey,
        goal: tpl.goal,
        screenshotUrlsByLocale: {},
        swissSpecific: tpl.swissSpecific,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: landingPageTemplates.key,
        set: {
          nameKey: tpl.nameKey,
          descriptionKey: tpl.descriptionKey,
          vertical: tpl.vertical,
          style: tpl.style,
          sectionsByLocale: tpl.sectionsByLocale as Record<string, unknown>,
          availableLocales: tpl.availableLocales as string[],
          themeKey: tpl.themeKey,
          imageBundleKey: tpl.imageBundleKey,
          goal: tpl.goal,
          swissSpecific: tpl.swissSpecific,
          isActive: true,
        },
      });
    console.log(`  ✓ ${tpl.key} (${tpl.vertical}/${tpl.style}, ${tpl.availableLocales.join(", ")})`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
