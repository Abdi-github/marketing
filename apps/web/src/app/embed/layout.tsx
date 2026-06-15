import type { ReactNode } from "react";
import "../globals.css";

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white font-sans antialiased">{children}</body>
    </html>
  );
}
