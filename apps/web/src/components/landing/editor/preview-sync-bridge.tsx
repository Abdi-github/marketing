"use client";

// LP-5: Two-way scroll/selection sync between the editor sidebar and this preview iframe.
//  - Parent → preview: `{ source:"lp-editor", type:"scrollTo", index }` scrolls the matching
//    section into view and flashes a highlight.
//  - Preview → parent: as the user scrolls the preview, the most-visible section's index is
//    posted back as `{ source:"lp-preview", type:"active", index }` so the sidebar can highlight it.
//
// Sections are matched by the `[data-lp-section]` / `id="lp-section-N"` wrappers the
// draft-preview route renders around each SectionBlock.

import { useEffect } from "react";

export function PreviewSyncBridge() {
  useEffect(() => {
    const parentOrigin = window.location.origin;

    function flash(el: Element) {
      const node = el as HTMLElement;
      const prev = node.style.boxShadow;
      const prevTransition = node.style.transition;
      node.style.transition = "box-shadow 0.2s ease";
      node.style.boxShadow = "inset 0 0 0 3px rgba(147,51,234,0.6)";
      window.setTimeout(() => {
        node.style.boxShadow = prev;
        window.setTimeout(() => { node.style.transition = prevTransition; }, 250);
      }, 900);
    }

    // ── Parent → preview: scroll a section into view ─────────────────────────
    function onMessage(e: MessageEvent) {
      if (e.origin !== parentOrigin) return;
      const data = e.data as { source?: string; type?: string; index?: number } | null;
      if (!data || data.source !== "lp-editor" || data.type !== "scrollTo" || typeof data.index !== "number") return;
      const el = document.getElementById(`lp-section-${data.index}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        flash(el);
      }
    }
    window.addEventListener("message", onMessage);

    // ── Preview → parent: report most-visible section while scrolling ────────
    let lastSent = -1;
    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idxAttr = (entry.target as HTMLElement).dataset.lpSection;
          if (idxAttr == null) continue;
          visibility.set(Number(idxAttr), entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        // Pick the section with the largest visible ratio.
        let best = -1;
        let bestRatio = 0;
        for (const [idx, ratio] of visibility) {
          if (ratio > bestRatio) { bestRatio = ratio; best = idx; }
        }
        if (best !== -1 && best !== lastSent) {
          lastSent = best;
          window.parent?.postMessage({ source: "lp-preview", type: "active", index: best }, parentOrigin);
        }
      },
      { threshold: [0.1, 0.25, 0.5, 0.75] },
    );

    const nodes = document.querySelectorAll("[data-lp-section]");
    nodes.forEach((n) => observer.observe(n));

    return () => {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    };
  }, []);

  return null;
}
