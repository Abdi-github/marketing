import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { auth } from "@marketing/auth";
import { db } from "@marketing/db";
import { socialPosts, businessProfiles } from "@marketing/db";
import { buildTenantContext } from "@marketing/tenancy";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1080;
const H = 1080;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token);
  if (!tenantCtx) return new Response("Forbidden", { status: 403 });

  const [post] = await db
    .select({ generatedText: socialPosts.generatedText, status: socialPosts.status })
    .from(socialPosts)
    .where(and(eq(socialPosts.tenantId, tenantCtx.tenantId), eq(socialPosts.jobId, jobId)));

  if (!post || post.status !== "completed" || !post.generatedText) {
    return new Response("Not found", { status: 404 });
  }

  const [profile] = await db
    .select({ businessName: businessProfiles.businessName, vertical: businessProfiles.vertical })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, tenantCtx.tenantId));

  const businessName = profile?.businessName ?? "My Business";
  const vertical = profile?.vertical ?? "";
  const text = post.generatedText;

  // Trim text for card — show up to ~220 chars, ending at a word boundary
  const maxLen = 220;
  const trimmed = text.length <= maxLen ? text : text.slice(0, text.lastIndexOf(" ", maxLen)) + "…";

  const accentColor = verticalColor(vertical);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          width: "72px",
          height: "6px",
          background: accentColor,
          borderRadius: "3px",
          marginBottom: "52px",
        }}
      />

      {/* Business name */}
      <div
        style={{
          fontSize: "26px",
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: "48px",
        }}
      >
        {businessName}
      </div>

      {/* Post text — centred vertically */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: text.length < 80 ? "56px" : text.length < 140 ? "48px" : "40px",
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.4,
            letterSpacing: "-0.01em",
          }}
        >
          {trimmed}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid #e5e7eb",
          paddingTop: "36px",
        }}
      >
        <div style={{ fontSize: "22px", fontWeight: 500, color: "#9ca3af" }}>Marketing AI</div>
        <div
          style={{
            fontSize: "18px",
            color: "#9ca3af",
            background: "#f9fafb",
            padding: "6px 16px",
            borderRadius: "20px",
            border: "1px solid #e5e7eb",
          }}
        >
          🇨🇭 Switzerland
        </div>
      </div>
    </div>,
    {
      width: W,
      height: H,
    },
  );
}

function verticalColor(vertical: string): string {
  if (vertical.includes("fitness") || vertical.includes("yoga")) return "#f97316"; // orange
  if (vertical.includes("restaurant") || vertical.includes("cafe") || vertical.includes("café"))
    return "#16a34a"; // green
  return "#2563eb"; // default blue
}
