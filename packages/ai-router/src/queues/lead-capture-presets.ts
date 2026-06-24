import { z } from "zod";

export const leadCapturePresetSchema = z.enum([
  "reservation",
  "quote",
  "callback",
  "newsletter",
  "whatsapp_first",
  "sms_fallback",
]);

export const leadCaptureChannelSchema = z.enum(["email", "phone", "sms", "whatsapp"]);
export const leadKindSchema = z.enum(["booking", "callback", "quote", "generic"]);

export type LeadCapturePreset = z.infer<typeof leadCapturePresetSchema>;
export type LeadCaptureChannel = z.infer<typeof leadCaptureChannelSchema>;
export type LeadKind = z.infer<typeof leadKindSchema>;

export type LeadCapturePresetConfig = {
  preset: LeadCapturePreset;
  leadKind: LeadKind;
  captureChannels: LeadCaptureChannel[];
};

export const LEAD_CAPTURE_PRESETS: Record<LeadCapturePreset, LeadCapturePresetConfig> = {
  reservation: {
    preset: "reservation",
    leadKind: "booking",
    captureChannels: ["email", "phone", "sms", "whatsapp"],
  },
  quote: {
    preset: "quote",
    leadKind: "quote",
    captureChannels: ["email", "phone"],
  },
  callback: {
    preset: "callback",
    leadKind: "callback",
    captureChannels: ["phone", "sms"],
  },
  newsletter: {
    preset: "newsletter",
    leadKind: "generic",
    captureChannels: ["email"],
  },
  whatsapp_first: {
    preset: "whatsapp_first",
    leadKind: "callback",
    captureChannels: ["whatsapp", "phone"],
  },
  sms_fallback: {
    preset: "sms_fallback",
    leadKind: "callback",
    captureChannels: ["phone", "sms", "email"],
  },
};

export function resolveLeadCapturePreset(
  preset: string | null | undefined,
): LeadCapturePresetConfig {
  const parsed = leadCapturePresetSchema.safeParse(preset);
  if (!parsed.success) return LEAD_CAPTURE_PRESETS.quote;
  return LEAD_CAPTURE_PRESETS[parsed.data];
}
