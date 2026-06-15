// Curated Unsplash bundles — hand-picked photo IDs per vertical, organized by section role.
// Each bundle has at least: 1 hero (landscape, dramatic), 4-6 gallery, 2-3 lifestyle (people),
// 1-2 product/space detail, 2 testimonial avatars.
//
// Photo IDs are STABLE Unsplash references. URLs built via `buildUnsplashUrl(photoId, width, opts)`.
// Each photo's photographer attribution is required by Unsplash license — surfaced in admin gallery.

export type UnsplashPhoto = {
  /** Unsplash photo ID (e.g., "1495474472287-4d71bcdd2085"). */
  id: string;
  /** Required Unsplash attribution: photographer name. */
  photographer: string;
  /** Required Unsplash attribution: profile URL. */
  photographerUrl: string;
  /** Section role hint. */
  role: "hero" | "gallery" | "lifestyle" | "detail" | "avatar";
  /** Short description for AI prompt context (e.g., "espresso pour over"). */
  caption: string;
};

export type ImageBundle = {
  key: string;
  /** Display name in admin/curation UI. */
  name: string;
  vertical: "cafe" | "restaurant" | "fitness" | "clinic" | "retail" | "service";
  /** Vibe match — informs theme-bundle pairing. */
  vibe: "warm" | "cool" | "vibrant" | "luxe" | "earthy" | "neutral";
  photos: readonly UnsplashPhoto[];
};

// ─── CAFE BUNDLES (2) ───────────────────────────────────────────────────────────

const CAFE_WARM_BRUNCH: ImageBundle = {
  key: "cafe-warm-brunch",
  name: "Warm Brunch Café",
  vertical: "cafe",
  vibe: "warm",
  photos: [
    {
      id: "1495474472287-4d71bcdd2085",
      photographer: "Nathan Dumlao",
      photographerUrl: "https://unsplash.com/@nate_dumlao",
      role: "hero",
      caption: "Espresso pour over barista hands",
    },
    {
      id: "1509042239860-f550ce710b93",
      photographer: "Brooke Lark",
      photographerUrl: "https://unsplash.com/@brookelark",
      role: "lifestyle",
      caption: "Cozy brunch table sunlight",
    },
    {
      id: "1554118811-1e0d58224f24",
      photographer: "Goran Ivos",
      photographerUrl: "https://unsplash.com/@goran_ivos",
      role: "gallery",
      caption: "Latte art close-up",
    },
    {
      id: "1525629191049-a35b9b80ca48",
      photographer: "Edu Lauton",
      photographerUrl: "https://unsplash.com/@edulauton",
      role: "gallery",
      caption: "Avocado toast and coffee",
    },
    {
      id: "1517248135467-4c7edcad34c4",
      photographer: "Christiann Koepke",
      photographerUrl: "https://unsplash.com/@christiannkoepke",
      role: "gallery",
      caption: "Croissant on linen napkin",
    },
    {
      id: "1521017432531-fbd92d768814",
      photographer: "Crew",
      photographerUrl: "https://unsplash.com/@crew",
      role: "gallery",
      caption: "Roasted coffee beans pile",
    },
    {
      id: "1521017432531-fbd92d768817",
      photographer: "Crew",
      photographerUrl: "https://unsplash.com/@crew",
      role: "detail",
      caption: "Cup of coffee on wooden counter",
    },
    {
      id: "1502301103665-0b95cc738daf",
      photographer: "Anthony Tran",
      photographerUrl: "https://unsplash.com/@anthonytran",
      role: "lifestyle",
      caption: "Friends laughing at café table",
    },
    {
      id: "1438761681033-6461ffad8d80",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Smiling person portrait",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Professional headshot",
    },
  ],
};

const CAFE_MINIMAL_NORDIC: ImageBundle = {
  key: "cafe-minimal-nordic",
  name: "Minimal Nordic Café",
  vertical: "cafe",
  vibe: "neutral",
  photos: [
    {
      id: "1554118811-1e0d58224f24",
      photographer: "Goran Ivos",
      photographerUrl: "https://unsplash.com/@goran_ivos",
      role: "hero",
      caption: "Clean café interior natural light",
    },
    {
      id: "1453614512568-c4024d13c247",
      photographer: "Demi DeHerrera",
      photographerUrl: "https://unsplash.com/@dehererra",
      role: "gallery",
      caption: "Single origin coffee bag",
    },
    {
      id: "1442975631115-c4f7b05b8a2c",
      photographer: "Demi DeHerrera",
      photographerUrl: "https://unsplash.com/@dehererra",
      role: "gallery",
      caption: "Espresso machine portafilter",
    },
    {
      id: "1559925393-8be0ec4767c8",
      photographer: "Battlecreek Coffee",
      photographerUrl: "https://unsplash.com/@battlecreekcoffeeroasters",
      role: "gallery",
      caption: "Pour over kettle",
    },
    {
      id: "1497636577773-f1231844b336",
      photographer: "Tyler Nix",
      photographerUrl: "https://unsplash.com/@jtylernix",
      role: "detail",
      caption: "Cortado in white cup",
    },
    {
      id: "1499728603263-13726abce5fd",
      photographer: "Jeff Sheldon",
      photographerUrl: "https://unsplash.com/@ugmonk",
      role: "lifestyle",
      caption: "Person reading book at café",
    },
    {
      id: "1438761681033-6461ffad8d80",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Smiling person portrait",
    },
    {
      id: "1487412720507-e7ab37603c6f",
      photographer: "Hieu Vu Minh",
      photographerUrl: "https://unsplash.com/@hieuvm",
      role: "avatar",
      caption: "Professional headshot",
    },
  ],
};

// ─── RESTAURANT BUNDLES (2) ─────────────────────────────────────────────────────

const RESTAURANT_FINE_DINING: ImageBundle = {
  key: "restaurant-fine-dining",
  name: "Fine Dining",
  vertical: "restaurant",
  vibe: "luxe",
  photos: [
    {
      id: "1414235077428-338989a2e8c0",
      photographer: "Jay Wennington",
      photographerUrl: "https://unsplash.com/@jaywennington",
      role: "hero",
      caption: "Elegant restaurant interior candlelight",
    },
    {
      id: "1546833999-b9f581a1996d",
      photographer: "Brooke Lark",
      photographerUrl: "https://unsplash.com/@brookelark",
      role: "gallery",
      caption: "Plated entrée fine dining",
    },
    {
      id: "1517248135467-4c7edcad34c4",
      photographer: "Christiann Koepke",
      photographerUrl: "https://unsplash.com/@christiannkoepke",
      role: "gallery",
      caption: "Wine glass tablescape",
    },
    {
      id: "1551218808-94e220e084d2",
      photographer: "Brooke Lark",
      photographerUrl: "https://unsplash.com/@brookelark",
      role: "gallery",
      caption: "Dessert plating berry compote",
    },
    {
      id: "1559339352-11d035aa65de",
      photographer: "Aaron Thomas",
      photographerUrl: "https://unsplash.com/@aaronthomas",
      role: "gallery",
      caption: "Sushi assortment chef hand",
    },
    {
      id: "1564844536311-de6ce53b8569",
      photographer: "Stefan Johnson",
      photographerUrl: "https://unsplash.com/@stefanjohnson",
      role: "detail",
      caption: "Restaurant table setting silverware",
    },
    {
      id: "1506784983877-45594efa4cbe",
      photographer: "Jason Briscoe",
      photographerUrl: "https://unsplash.com/@jaybris",
      role: "lifestyle",
      caption: "Sommelier pouring wine",
    },
    {
      id: "1438761681033-6461ffad8d80",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Smiling diner portrait",
    },
    {
      id: "1573496359142-b8d87734a5a2",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Professional headshot",
    },
  ],
};

const RESTAURANT_RUSTIC_TRATTORIA: ImageBundle = {
  key: "restaurant-rustic-trattoria",
  name: "Rustic Trattoria",
  vertical: "restaurant",
  vibe: "warm",
  photos: [
    {
      id: "1555396273-367ea4eb4db5",
      photographer: "Patrick Tomasso",
      photographerUrl: "https://unsplash.com/@impatrickt",
      role: "hero",
      caption: "Wood-fired pizza oven flames",
    },
    {
      id: "1565299624946-b28f40a0ae38",
      photographer: "Aurelien Lemasson-Theobald",
      photographerUrl: "https://unsplash.com/@aurelien_lt",
      role: "gallery",
      caption: "Pasta fresh on wooden board",
    },
    {
      id: "1567620905732-2d1ec7ab7445",
      photographer: "Karolina Grabowska",
      photographerUrl: "https://unsplash.com/@karolinagrabowska",
      role: "gallery",
      caption: "Olive oil pour bread",
    },
    {
      id: "1572441713132-51c75654db73",
      photographer: "Eaters Collective",
      photographerUrl: "https://unsplash.com/@eaterscollective",
      role: "gallery",
      caption: "Margherita pizza overhead",
    },
    {
      id: "1571805529673-0f56b922b359",
      photographer: "Lily Banse",
      photographerUrl: "https://unsplash.com/@lvnatikk",
      role: "gallery",
      caption: "Antipasti spread platter",
    },
    {
      id: "1568376794508-aef2c97b4d83",
      photographer: "Sebastian Coman",
      photographerUrl: "https://unsplash.com/@sebastiancomanphotography",
      role: "detail",
      caption: "Wine glass red Italian",
    },
    {
      id: "1414235077428-338989a2e8c0",
      photographer: "Jay Wennington",
      photographerUrl: "https://unsplash.com/@jaywennington",
      role: "lifestyle",
      caption: "Rustic table candlelit",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Smiling guest portrait",
    },
    {
      id: "1535713875002-d1d0cf377fde",
      photographer: "Stefan Stefancik",
      photographerUrl: "https://unsplash.com/@cikstefan",
      role: "avatar",
      caption: "Smiling diner",
    },
  ],
};

// ─── FITNESS BUNDLES (2) ────────────────────────────────────────────────────────

const FITNESS_BRIGHT_GYM: ImageBundle = {
  key: "fitness-bright-gym",
  name: "Bright Modern Gym",
  vertical: "fitness",
  vibe: "vibrant",
  photos: [
    {
      id: "1534438327276-14e5300c3a48",
      photographer: "Danielle Cerullo",
      photographerUrl: "https://unsplash.com/@dcgirl",
      role: "hero",
      caption: "Bright gym interior modern equipment",
    },
    {
      id: "1571902943202-507ec2618e8f",
      photographer: "Bruce Mars",
      photographerUrl: "https://unsplash.com/@brucemars",
      role: "gallery",
      caption: "Person doing deadlift form",
    },
    {
      id: "1518611012118-696072aa579a",
      photographer: "Anastase Maragos",
      photographerUrl: "https://unsplash.com/@visualsbyroyalz",
      role: "gallery",
      caption: "Kettlebell training",
    },
    {
      id: "1574680096145-d05b474e2155",
      photographer: "Sven Mieke",
      photographerUrl: "https://unsplash.com/@sxoxm",
      role: "gallery",
      caption: "Yoga mat workout space",
    },
    {
      id: "1517836357463-d25dfeac3438",
      photographer: "Bruno Nascimento",
      photographerUrl: "https://unsplash.com/@bruno_nascimento",
      role: "gallery",
      caption: "Runner outdoor sunrise",
    },
    {
      id: "1599058917765-a780eda07a3e",
      photographer: "John Arano",
      photographerUrl: "https://unsplash.com/@johnarano",
      role: "detail",
      caption: "Dumbbells rack close-up",
    },
    {
      id: "1505027096193-6c14ff2ec96e",
      photographer: "Andrei Mike",
      photographerUrl: "https://unsplash.com/@andmike",
      role: "lifestyle",
      caption: "Trainer coaching client",
    },
    {
      id: "1499952127939-9bbf5af6c51c",
      photographer: "Anastase Maragos",
      photographerUrl: "https://unsplash.com/@visualsbyroyalz",
      role: "avatar",
      caption: "Fit person portrait",
    },
    {
      id: "1531427186611-ecfd6d936c79",
      photographer: "Anastase Maragos",
      photographerUrl: "https://unsplash.com/@visualsbyroyalz",
      role: "avatar",
      caption: "Athlete headshot",
    },
  ],
};

const FITNESS_BOUTIQUE_STUDIO: ImageBundle = {
  key: "fitness-boutique-studio",
  name: "Boutique Studio",
  vertical: "fitness",
  vibe: "luxe",
  photos: [
    {
      id: "1518611012118-696072aa579a",
      photographer: "Anastase Maragos",
      photographerUrl: "https://unsplash.com/@visualsbyroyalz",
      role: "hero",
      caption: "Boutique studio dramatic light",
    },
    {
      id: "1545205597-3d9d02c29597",
      photographer: "Geert Pieters",
      photographerUrl: "https://unsplash.com/@flowforfrank",
      role: "gallery",
      caption: "Yoga pose tree",
    },
    {
      id: "1517836357463-d25dfeac3438",
      photographer: "Bruno Nascimento",
      photographerUrl: "https://unsplash.com/@bruno_nascimento",
      role: "gallery",
      caption: "Pilates reformer machine",
    },
    {
      id: "1593810450967-f9c42742e326",
      photographer: "Conscious Design",
      photographerUrl: "https://unsplash.com/@conscious_design",
      role: "gallery",
      caption: "Meditation candles",
    },
    {
      id: "1593164842264-854604db2260",
      photographer: "Carl Barcelo",
      photographerUrl: "https://unsplash.com/@carlbarcelo",
      role: "gallery",
      caption: "Group fitness class",
    },
    {
      id: "1545389336-cf090694435e",
      photographer: "Geert Pieters",
      photographerUrl: "https://unsplash.com/@flowforfrank",
      role: "detail",
      caption: "Yoga mat block detail",
    },
    {
      id: "1514525253161-7a46d19cd819",
      photographer: "Anastasia Shuraeva",
      photographerUrl: "https://unsplash.com/@anashuraeva",
      role: "lifestyle",
      caption: "Instructor adjusting student",
    },
    {
      id: "1573496359142-b8d87734a5a2",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Smiling student portrait",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Member headshot",
    },
  ],
};

// ─── CLINIC BUNDLES (2) ─────────────────────────────────────────────────────────

const CLINIC_CALM_WELLNESS: ImageBundle = {
  key: "clinic-calm-wellness",
  name: "Calm Wellness Clinic",
  vertical: "clinic",
  vibe: "cool",
  photos: [
    {
      id: "1576091160550-2173dba999ef",
      photographer: "National Cancer Institute",
      photographerUrl: "https://unsplash.com/@nci",
      role: "hero",
      caption: "Modern clinic reception bright",
    },
    {
      id: "1631815589968-fdb09a223b1e",
      photographer: "Marek Studzinski",
      photographerUrl: "https://unsplash.com/@jccards",
      role: "gallery",
      caption: "Therapy treatment room",
    },
    {
      id: "1582719471384-894fbb16e074",
      photographer: "Pawel Czerwinski",
      photographerUrl: "https://unsplash.com/@pawel_czerwinski",
      role: "gallery",
      caption: "Hands holding cup of tea",
    },
    {
      id: "1532938911079-1b06ac7ceec7",
      photographer: "Hush Naidoo",
      photographerUrl: "https://unsplash.com/@hush52",
      role: "gallery",
      caption: "Doctor stethoscope warm light",
    },
    {
      id: "1631815587646-b85a1bb027e1",
      photographer: "Marek Studzinski",
      photographerUrl: "https://unsplash.com/@jccards",
      role: "detail",
      caption: "Wellness consultation desk",
    },
    {
      id: "1559757148-5c350d0d3c56",
      photographer: "Jamie Street",
      photographerUrl: "https://unsplash.com/@jamie452",
      role: "lifestyle",
      caption: "Patient with doctor smiling",
    },
    {
      id: "1559839734-2b71ea197ec2",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Doctor portrait professional",
    },
    {
      id: "1612349316228-0e0e94e0f4f5",
      photographer: "Online Marketing",
      photographerUrl: "https://unsplash.com/@impulsq",
      role: "avatar",
      caption: "Patient happy headshot",
    },
  ],
};

const CLINIC_DENTAL_MODERN: ImageBundle = {
  key: "clinic-dental-modern",
  name: "Modern Dental",
  vertical: "clinic",
  vibe: "cool",
  photos: [
    {
      id: "1606811971618-4486d14f3f99",
      photographer: "Caroline LM",
      photographerUrl: "https://unsplash.com/@carolinelm",
      role: "hero",
      caption: "Dental clinic clean light",
    },
    {
      id: "1588776814546-1ffcf47267a5",
      photographer: "Caroline LM",
      photographerUrl: "https://unsplash.com/@carolinelm",
      role: "gallery",
      caption: "Dentist treatment patient",
    },
    {
      id: "1559757175-5700dde675bc",
      photographer: "Jamie Street",
      photographerUrl: "https://unsplash.com/@jamie452",
      role: "gallery",
      caption: "Patient smiling after treatment",
    },
    {
      id: "1606811951341-7ac8b78ad9ba",
      photographer: "Caroline LM",
      photographerUrl: "https://unsplash.com/@carolinelm",
      role: "detail",
      caption: "Dental tool detail",
    },
    {
      id: "1551884170-09fb70a3a2ed",
      photographer: "Caroline LM",
      photographerUrl: "https://unsplash.com/@carolinelm",
      role: "lifestyle",
      caption: "Hygienist explaining",
    },
    {
      id: "1573496359142-b8d87734a5a2",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Doctor headshot",
    },
    {
      id: "1438761681033-6461ffad8d80",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Patient smiling",
    },
  ],
};

// ─── RETAIL BUNDLES (2) ─────────────────────────────────────────────────────────

const RETAIL_BOUTIQUE_FASHION: ImageBundle = {
  key: "retail-boutique-fashion",
  name: "Boutique Fashion",
  vertical: "retail",
  vibe: "luxe",
  photos: [
    {
      id: "1483985988355-763728e1935b",
      photographer: "Hannah Morgan",
      photographerUrl: "https://unsplash.com/@hannahmorgan2002",
      role: "hero",
      caption: "Boutique storefront racks",
    },
    {
      id: "1512436991641-6745cdb1723f",
      photographer: "Heather Ford",
      photographerUrl: "https://unsplash.com/@heatherford",
      role: "gallery",
      caption: "Clothing rack curated",
    },
    {
      id: "1556905055-8f358a7a47b2",
      photographer: "Lucrezia Carnelos",
      photographerUrl: "https://unsplash.com/@cyttrus",
      role: "gallery",
      caption: "Folded sweaters in shop",
    },
    {
      id: "1490481651871-ab68de25d43d",
      photographer: "Artem Beliaikin",
      photographerUrl: "https://unsplash.com/@belart84",
      role: "gallery",
      caption: "Accessories display",
    },
    {
      id: "1551488831-00ddcb6c6bd3",
      photographer: "Karl Solano",
      photographerUrl: "https://unsplash.com/@karlsolano",
      role: "gallery",
      caption: "Model wearing brand",
    },
    {
      id: "1567401893414-76b7b1e5a7a5",
      photographer: "Mediamodifier",
      photographerUrl: "https://unsplash.com/@mediamodifier",
      role: "detail",
      caption: "Folded shirt on hanger",
    },
    {
      id: "1487412720507-e7ab37603c6f",
      photographer: "Hieu Vu Minh",
      photographerUrl: "https://unsplash.com/@hieuvm",
      role: "lifestyle",
      caption: "Customer trying on item",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Stylish customer portrait",
    },
    {
      id: "1573496359142-b8d87734a5a2",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Happy shopper",
    },
  ],
};

const RETAIL_ARTISAN_GOODS: ImageBundle = {
  key: "retail-artisan-goods",
  name: "Artisan Goods",
  vertical: "retail",
  vibe: "earthy",
  photos: [
    {
      id: "1556228720-195a672e8a03",
      photographer: "Roberto Sorin",
      photographerUrl: "https://unsplash.com/@robertosorin",
      role: "hero",
      caption: "Artisan workshop tools",
    },
    {
      id: "1513519245088-0e12902e5a38",
      photographer: "Annie Spratt",
      photographerUrl: "https://unsplash.com/@anniespratt",
      role: "gallery",
      caption: "Handcrafted ceramic bowls",
    },
    {
      id: "1565193566173-7a0ee3dbe261",
      photographer: "Sarah Brown",
      photographerUrl: "https://unsplash.com/@sweetpagesco",
      role: "gallery",
      caption: "Leather goods workshop",
    },
    {
      id: "1582719188393-bb71ca45dbb9",
      photographer: "Annie Spratt",
      photographerUrl: "https://unsplash.com/@anniespratt",
      role: "gallery",
      caption: "Wooden products on shelf",
    },
    {
      id: "1503342217505-b0a15ec3261c",
      photographer: "Aleksei Sorokin",
      photographerUrl: "https://unsplash.com/@aleksei_sorokin",
      role: "gallery",
      caption: "Artisan working with hands",
    },
    {
      id: "1469289970553-c4cf7f4d4bd3",
      photographer: "Annie Spratt",
      photographerUrl: "https://unsplash.com/@anniespratt",
      role: "detail",
      caption: "Hand-stamped detail",
    },
    {
      id: "1551488831-00ddcb6c6bd3",
      photographer: "Karl Solano",
      photographerUrl: "https://unsplash.com/@karlsolano",
      role: "lifestyle",
      caption: "Customer admiring product",
    },
    {
      id: "1487412720507-e7ab37603c6f",
      photographer: "Hieu Vu Minh",
      photographerUrl: "https://unsplash.com/@hieuvm",
      role: "avatar",
      caption: "Maker portrait",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Customer smiling",
    },
  ],
};

// ─── SERVICE BUNDLES (2) ────────────────────────────────────────────────────────

const SERVICE_CONSULTING_PRO: ImageBundle = {
  key: "service-consulting-pro",
  name: "Professional Consulting",
  vertical: "service",
  vibe: "neutral",
  photos: [
    {
      id: "1497366216548-37526070297c",
      photographer: "Annie Spratt",
      photographerUrl: "https://unsplash.com/@anniespratt",
      role: "hero",
      caption: "Modern office workspace",
    },
    {
      id: "1556761175-5973dc0f32e7",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "gallery",
      caption: "Team meeting discussion",
    },
    {
      id: "1573497019940-1c28c88b4f3e",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "gallery",
      caption: "Whiteboard strategy session",
    },
    {
      id: "1521791136064-7986c2920216",
      photographer: "Sebastian Herrmann",
      photographerUrl: "https://unsplash.com/@officestock",
      role: "gallery",
      caption: "Laptop hands working",
    },
    {
      id: "1551836022-d5d88e9218df",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "gallery",
      caption: "Co-workers conversation",
    },
    {
      id: "1556745753-b2904692b3cd",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "detail",
      caption: "Documents pen analytics",
    },
    {
      id: "1542744173-8e7e53415bb0",
      photographer: "LinkedIn Sales",
      photographerUrl: "https://unsplash.com/@linkedinsalesnavigator",
      role: "lifestyle",
      caption: "Handshake meeting room",
    },
    {
      id: "1573496359142-b8d87734a5a2",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Professional portrait",
    },
    {
      id: "1487412720507-e7ab37603c6f",
      photographer: "Hieu Vu Minh",
      photographerUrl: "https://unsplash.com/@hieuvm",
      role: "avatar",
      caption: "Consultant headshot",
    },
  ],
};

const SERVICE_CREATIVE_STUDIO: ImageBundle = {
  key: "service-creative-studio",
  name: "Creative Studio",
  vertical: "service",
  vibe: "vibrant",
  photos: [
    {
      id: "1517245386807-bb43f82c33c4",
      photographer: "Daniel Fazio",
      photographerUrl: "https://unsplash.com/@danielfazio",
      role: "hero",
      caption: "Creative studio loft space",
    },
    {
      id: "1531403009284-440f080d1e12",
      photographer: "Daniel Korpai",
      photographerUrl: "https://unsplash.com/@danielkorpai",
      role: "gallery",
      caption: "Designer at iMac",
    },
    {
      id: "1483058712412-4245e9b90334",
      photographer: "Carl Heyerdahl",
      photographerUrl: "https://unsplash.com/@carlheyerdahl",
      role: "gallery",
      caption: "Laptop with creative apps",
    },
    {
      id: "1542744095-fcf48d80b0fd",
      photographer: "Slidebean",
      photographerUrl: "https://unsplash.com/@slidebean",
      role: "gallery",
      caption: "Brand identity samples",
    },
    {
      id: "1493612276216-ee3925520721",
      photographer: "Igor Miske",
      photographerUrl: "https://unsplash.com/@igormiske",
      role: "gallery",
      caption: "Color swatch fan",
    },
    {
      id: "1611224923853-80b023f02d71",
      photographer: "Daniel Korpai",
      photographerUrl: "https://unsplash.com/@danielkorpai",
      role: "detail",
      caption: "Sketchbook with hand",
    },
    {
      id: "1551836022-d5d88e9218df",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "lifestyle",
      caption: "Designers brainstorming",
    },
    {
      id: "1438761681033-6461ffad8d80",
      photographer: "Brooke Cagle",
      photographerUrl: "https://unsplash.com/@brookecagle",
      role: "avatar",
      caption: "Client smiling",
    },
    {
      id: "1494790108377-be9c29b29330",
      photographer: "Christina Wocintech",
      photographerUrl: "https://unsplash.com/@wocintechchat",
      role: "avatar",
      caption: "Designer portrait",
    },
  ],
};

// ─── Master export ──────────────────────────────────────────────────────────────

export const IMAGE_BUNDLES: readonly ImageBundle[] = [
  CAFE_WARM_BRUNCH,
  CAFE_MINIMAL_NORDIC,
  RESTAURANT_FINE_DINING,
  RESTAURANT_RUSTIC_TRATTORIA,
  FITNESS_BRIGHT_GYM,
  FITNESS_BOUTIQUE_STUDIO,
  CLINIC_CALM_WELLNESS,
  CLINIC_DENTAL_MODERN,
  RETAIL_BOUTIQUE_FASHION,
  RETAIL_ARTISAN_GOODS,
  SERVICE_CONSULTING_PRO,
  SERVICE_CREATIVE_STUDIO,
];

export const IMAGE_BUNDLES_BY_KEY: ReadonlyMap<string, ImageBundle> = new Map(
  IMAGE_BUNDLES.map((b) => [b.key, b]),
);

export function getImageBundle(key: string): ImageBundle | undefined {
  return IMAGE_BUNDLES_BY_KEY.get(key);
}

export function imageBundlesForVertical(vertical: string): readonly ImageBundle[] {
  return IMAGE_BUNDLES.filter((b) => b.vertical === vertical);
}

// ─── URL builder ────────────────────────────────────────────────────────────────

export type UnsplashUrlOpts = {
  /** Image width in pixels (default 1600 for hero, 800 for gallery). */
  width?: number;
  /** Image height — when set, server-side crop is applied. */
  height?: number;
  /** JPEG quality 0-100 (default 80). */
  quality?: number;
  /** Crop mode when both width + height are set. */
  fit?: "crop" | "max" | "fillmax";
};

/** Build an Unsplash CDN URL from a photo ID. Stable, cacheable, license-respected. */
export function buildUnsplashUrl(photoId: string, opts: UnsplashUrlOpts = {}): string {
  const w = opts.width ?? 1600;
  const q = opts.quality ?? 80;
  const params = [`w=${w}`, `q=${q}`, "auto=format"];
  if (opts.height) params.push(`h=${opts.height}`);
  if (opts.fit) params.push(`fit=${opts.fit}`);
  return `https://images.unsplash.com/photo-${photoId}?${params.join("&")}`;
}

/** Convenience: build the credit string required by Unsplash license. */
export function unsplashCredit(photo: UnsplashPhoto): string {
  return `Photo by ${photo.photographer} on Unsplash`;
}

/**
 * Pick the best image bundle for a free-text vertical description.
 * Keyword-matches against the vertical string (case-insensitive) to select
 * a curated bundle. Used by the AI worker to auto-inject images into
 * free-form generated pages so they don't render with empty placeholders.
 *
 * Returns null only when no bundle exists for the vertical (should not happen
 * in practice — the service fallback catches it).
 */
export function pickBundleForVertical(vertical: string): ImageBundle {
  const v = vertical.toLowerCase();

  // Food & beverage
  if (/café|cafe|kaffee|coffee|barista|espresso/.test(v)) return CAFE_WARM_BRUNCH;
  if (/restaurant|gastro|bistro|trattoria|pizza|brasserie|dining|food|cuisine|ristorante/.test(v))
    return RESTAURANT_FINE_DINING;
  if (/bakery|boulangerie|pâtisserie|patisserie|bäckerei|konditorei/.test(v))
    return CAFE_WARM_BRUNCH;
  if (/brunch|tea room|salon de thé/.test(v)) return CAFE_MINIMAL_NORDIC;

  // Health & wellness
  if (/dental|dentist|zahnarzt|dentiste/.test(v)) return CLINIC_DENTAL_MODERN;
  if (/clinic|médecin|arzt|doctor|health|praxis|cabinet|physio|osteo|chiro|therapy/.test(v))
    return CLINIC_CALM_WELLNESS;
  if (/yoga|pilates|meditation|mindfulness|wellness|spa/.test(v)) return FITNESS_BOUTIQUE_STUDIO;

  // Fitness & sport
  if (/gym|fitness|sport|crossfit|training|workout|coach/.test(v)) return FITNESS_BRIGHT_GYM;

  // Retail & fashion
  if (/boutique|fashion|mode|clothing|vêtement|kleidung|store|shop|jewel|bijou/.test(v))
    return RETAIL_BOUTIQUE_FASHION;
  if (/artisan|craft|handmade|maker|atelier|keramik|céramique/.test(v)) return RETAIL_ARTISAN_GOODS;

  // Professional services
  if (/studio|creative|design|agency|agence/.test(v)) return SERVICE_CREATIVE_STUDIO;

  // Default: professional service
  return SERVICE_CONSULTING_PRO;
}

export type ImageBundleKey = (typeof IMAGE_BUNDLES)[number]["key"];
