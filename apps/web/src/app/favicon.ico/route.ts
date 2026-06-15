export const runtime = "nodejs";

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#111827"/>
  <path d="M16 43V21h7l9 13 9-13h7v22h-7V31l-7 10h-4l-7-10v12h-7z" fill="#fff"/>
  <circle cx="49" cy="16" r="6" fill="#f59e0b"/>
</svg>`;

export function GET(): Response {
  return new Response(faviconSvg, {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
