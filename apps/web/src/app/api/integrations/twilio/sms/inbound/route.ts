import { env } from "@marketing/shared";
import { acceptTwilioWebhook } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return acceptTwilioWebhook({
    request,
    eventType: "sms.inbound",
    canonicalUrl:
      env.SMS_INBOUND_CALLBACK_URL ??
      `${env.APP_URL.replace(/\/$/, "")}/api/integrations/twilio/sms/inbound`,
  });
}
