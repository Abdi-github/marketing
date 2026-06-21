import { describe, expect, it } from "vitest";
import { normalizeLeadCaptureSettings } from "../lead-capture-workflow";

describe("lead capture workflow settings", () => {
  it("defaults legacy profiles to automatic acknowledgements and AI assistance", () => {
    const settings = normalizeLeadCaptureSettings({});

    expect(settings.preferredConfirmationChannel).toBe("auto");
    expect(settings.autoAcknowledgementEnabled).toBe(true);
    expect(settings.aiReplyAssistanceEnabled).toBe(true);
  });

  it("preserves explicit automation controls from tenant settings", () => {
    const settings = normalizeLeadCaptureSettings({
      preferredConfirmationChannel: "whatsapp",
      autoAcknowledgementEnabled: false,
      aiReplyAssistanceEnabled: false,
    });

    expect(settings.preferredConfirmationChannel).toBe("whatsapp");
    expect(settings.autoAcknowledgementEnabled).toBe(false);
    expect(settings.aiReplyAssistanceEnabled).toBe(false);
  });
});
