// Shared inline rich-text renderer for landing-page heading/body copy.
//
// The editor stores rich text as a tiny, safe Markdown-ish subset inside the same
// `heading` / `body` strings that already flow through the composition schema — no
// schema change, no HTML injection. Rendering happens here (and only here) so every
// section variant gets consistent formatting.
//
// Supported inline marks (kept deliberately small so they never break responsiveness):
//   **bold**      → <strong>
//   *italic*      → <em>
//   __underline__ → <u>
//   ~~strike~~    → <s>
//   newlines      → <br/>
//
// Because we emit semantic inline elements (not font-size overrides), formatted text
// wraps and reflows exactly like the surrounding copy on small screens.

import React from "react";

type Token = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };

// Ordered so longer markers (**, __, ~~) are tried before single-char ones.
const RULES: Array<{ re: RegExp; mark: keyof Omit<Token, "text"> }> = [
  { re: /\*\*([^*]+)\*\*/, mark: "bold" },
  { re: /__([^_]+)__/, mark: "underline" },
  { re: /~~([^~]+)~~/, mark: "strike" },
  { re: /\*([^*]+)\*/, mark: "italic" },
];

/** Parse a single line into styled tokens. Recursive so marks can nest (e.g. **bold *italic***). */
function parseLine(input: string, inherited: Omit<Token, "text"> = {}): Token[] {
  let earliest: { idx: number; rule: (typeof RULES)[number]; match: RegExpExecArray } | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(input);
    if (m && (earliest === null || m.index < earliest.idx)) {
      earliest = { idx: m.index, rule, match: m };
    }
  }

  if (!earliest) {
    return input ? [{ text: input, ...inherited }] : [];
  }

  const { match, rule } = earliest;
  const before = input.slice(0, match.index);
  const after = input.slice(match.index + match[0].length);

  return [
    ...(before ? [{ text: before, ...inherited }] : []),
    ...parseLine(match[1]!, { ...inherited, [rule.mark]: true }),
    ...parseLine(after, inherited),
  ];
}

function styleFor(tok: Token): React.CSSProperties {
  return {
    fontWeight: tok.bold ? 700 : undefined,
    fontStyle: tok.italic ? "italic" : undefined,
    textDecoration: [tok.underline ? "underline" : null, tok.strike ? "line-through" : null]
      .filter(Boolean)
      .join(" ") || undefined,
  };
}

/** Render a rich-text string into inline React nodes. Returns null for empty input. */
export function renderRich(text?: string | null): React.ReactNode {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  return lines.map((line, li) => (
    <React.Fragment key={li}>
      {li > 0 && <br />}
      {parseLine(line).map((tok, ti) => {
        const style = styleFor(tok);
        const hasStyle = style.fontWeight || style.fontStyle || style.textDecoration;
        return hasStyle ? (
          <span key={ti} style={style}>{tok.text}</span>
        ) : (
          <React.Fragment key={ti}>{tok.text}</React.Fragment>
        );
      })}
    </React.Fragment>
  ));
}

/** Strip rich-text markers — for places that need plain text (alt attributes, titles, meta). */
export function stripRich(text?: string | null): string {
  if (!text) return "";
  return String(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
