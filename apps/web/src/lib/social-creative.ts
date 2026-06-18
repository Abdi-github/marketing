export {
  buildSocialCreativePlan,
  getSocialCreativeDimensions,
  getSocialCreativePath,
  getSocialCreativePublicUrl,
  parsePromptInput,
  parseSocialCreativePlan,
  SOCIAL_CREATIVE_ASPECT_RATIOS,
  SOCIAL_CREATIVE_TEMPLATES,
} from "@marketing/ai-router";
export type {
  ResolvedSocialCreativeTemplate,
  SocialCreativeAspectRatio,
  SocialCreativePlan,
  SocialCreativeTemplate,
} from "@marketing/ai-router";

export function normalizeSocialCreativeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (isLoopbackHost(parsed.hostname) && parsed.pathname.startsWith("/api/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function absolutizeSocialCreativeUrl(baseOrigin: string, url: string): string {
  const normalized = normalizeSocialCreativeUrl(url);
  return new URL(normalized, `${baseOrigin.replace(/\/$/, "")}/`).toString();
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
