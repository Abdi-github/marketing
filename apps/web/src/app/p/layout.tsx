import type { ReactNode } from "react";
import "../globals.css";

// Root layout for public landing pages (/p/<tenant>/<page>).
// This route segment sits outside the [locale] tree so it has its own html/body.
// Next.js 15 requires each route subtree to declare html/body at its top.

export default function PublicLandingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white font-sans antialiased">{children}</body>
    </html>
  );
}
