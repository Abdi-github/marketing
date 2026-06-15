"use client";

// Scroll-reveal motion (ADR-0029 phase 2). Wraps a section so its content fades +
// rises into view as the visitor scrolls — the single biggest "modern feel" uplift
// applied uniformly across every page.
//
// SSR-safe: renders visible (opacity 1) on the server and on first client paint, so
// there's no flash and no-JS / SEO crawlers always see content. After mount, only
// elements that are *below* the fold are hidden and then revealed on scroll — so the
// hero never flickers. Honors prefers-reduced-motion (no animation at all).

import React, { useEffect, useRef, useState } from "react";

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Already in view on mount (e.g. hero) → leave visible, no animation.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return;

    setHidden(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHidden(false);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? "translateY(28px)" : "none",
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        willChange: hidden ? "opacity, transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}
