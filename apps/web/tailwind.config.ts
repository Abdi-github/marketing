import type { Config } from "tailwindcss";

// LP-1: design tokens consumed via CSS variables set by ThemeProvider (LP-3).
// `var(--brand-primary)` etc. are populated at render time from the chosen theme bundle.
// Static palette helpers (e.g., `bg-brand-primary`) work alongside Tailwind's standard color scale.

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary)",
          accent: "var(--brand-accent)",
          surface: "var(--brand-surface)",
          text: "var(--brand-text)",
        },
      },
      borderRadius: {
        "theme-sm": "var(--radius-sm)",
        "theme-md": "var(--radius-md)",
        "theme-lg": "var(--radius-lg)",
        "theme-xl": "var(--radius-xl)",
      },
      boxShadow: {
        "theme-xs": "var(--shadow-xs)",
        "theme-sm": "var(--shadow-sm)",
        "theme-md": "var(--shadow-md)",
        "theme-lg": "var(--shadow-lg)",
        "theme-xl": "var(--shadow-xl)",
      },
      spacing: {
        "section-sm": "3rem", // mobile section padding
        "section-md": "5rem", // tablet
        "section-lg": "7rem", // desktop — generous white space rule
      },
      maxWidth: {
        "container-narrow": "600px",
        "container-reading": "720px",
        "container-default": "960px",
        "container-wide": "1100px",
        "container-gallery": "1200px",
        "container-hero": "1440px",
      },
      screens: {
        // Standard breakpoints + device-preview targets
        xs: "375px", // phone
        // sm: 640px (Tailwind default)
        // md: 768px (Tailwind default, tablet)
        // lg: 1024px (Tailwind default)
        // xl: 1280px (Tailwind default, desktop)
        wide: "1920px", // large monitor
      },
    },
  },
  plugins: [],
};

export default config;
