type CarouselImage = { url?: string | null; caption?: string | null };

export function getHeroCarouselImages(extras?: {
  backgroundImageUrl?: string;
  images?: CarouselImage[];
}) {
  const seen = new Set<string>();
  return [
    ...(extras?.backgroundImageUrl ? [{ url: extras.backgroundImageUrl }] : []),
    ...(extras?.images ?? []),
  ].filter((image): image is { url: string; caption?: string | null } => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}
