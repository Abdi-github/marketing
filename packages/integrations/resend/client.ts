// Minimal Resend API client for transactional email (step-26).
// Docs: https://resend.com/docs/api-reference/emails/send-email
// ADR-0023: platform-level sender; per-tenant domain verification deferred.

export interface ResendEmailOptions {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendSendResult {
  id: string;
}

export async function sendViaResend(opts: ResendEmailOptions): Promise<ResendSendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      tags: opts.tags,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

// ─── Variable interpolation ───────────────────────────────────────────────────
// Templates may contain {{first_name}}, {{last_name}}, {{email}}, {{business_name}}.
// Unrecognised variables are left as-is so they surface in QA.

export type TemplateVars = {
  first_name?: string;
  last_name?: string;
  email?: string;
  business_name?: string;
};

export function interpolate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{first_name\}\}/g, vars.first_name ?? "")
    .replace(/\{\{last_name\}\}/g, vars.last_name ?? "")
    .replace(/\{\{email\}\}/g, vars.email ?? "")
    .replace(/\{\{business_name\}\}/g, vars.business_name ?? "");
}
