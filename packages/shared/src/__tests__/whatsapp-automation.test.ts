import { describe, expect, it } from "vitest";
import {
  computeWhatsappConversationState,
  extractWhatsappLeadFacts,
  mapLeadWorkflowKindToWhatsappIntent,
  summarizeWhatsappConnectionHealth,
} from "../whatsapp-automation";

describe("whatsapp automation helpers", () => {
  it("maps booking to reservation for hospitality verticals", () => {
    expect(mapLeadWorkflowKindToWhatsappIntent("booking", "Restaurant")).toBe("reservation");
    expect(mapLeadWorkflowKindToWhatsappIntent("booking", "Clinic")).toBe("appointment");
  });

  it("extracts structured reservation facts from inbound payload and meta", () => {
    const facts = extractWhatsappLeadFacts({
      payload: {
        name: "Ada Lovelace",
        date: "2026-06-22",
        time: "19:30",
        party_size: "4",
      },
      text: "Table for 4",
      phone: "+41790000000",
      meta: {
        location: { latitude: 46.99, longitude: 6.93, name: "Neuchatel" },
        attachmentKinds: ["image"],
        attachmentCount: 1,
      },
    });

    expect(facts.customerName).toBe("Ada Lovelace");
    expect(facts.reservationDate).toBe("2026-06-22");
    expect(facts.reservationTime).toBe("19:30");
    expect(facts.partySize).toBe(4);
    expect(facts.locationLabel).toBe("Neuchatel");
    expect(facts.attachmentKinds).toEqual(["image"]);
  });

  it("extracts reservation facts from plain text when structured payload is absent", () => {
    const facts = extractWhatsappLeadFacts({
      text: "Hello, I would like to reserve a table for 4 tomorrow at 19:30 under Jean Dupont.",
      phone: "+41790000000",
      meta: {},
    });

    expect(facts.customerName).toBe("Jean Dupont");
    expect(facts.partySize).toBe(4);
    expect(facts.reservationTime).toBe("19:30");
    expect(facts.reservationDate).toBeTruthy();
  });

  it("computes an open and closed 24-hour WhatsApp window", () => {
    const openState = computeWhatsappConversationState(
      new Date("2026-06-21T10:00:00.000Z"),
      new Date("2026-06-21T18:00:00.000Z"),
    );
    const closedState = computeWhatsappConversationState(
      new Date("2026-06-20T10:00:00.000Z"),
      new Date("2026-06-21T18:00:00.000Z"),
    );

    expect(openState.serviceWindowOpen).toBe(true);
    expect(openState.policy).toBe("session");
    expect(closedState.serviceWindowOpen).toBe(false);
    expect(closedState.policy).toBe("template_required");
  });

  it("summarizes test-mode and connected WhatsApp health consistently", () => {
    const testHealth = summarizeWhatsappConnectionHealth({
      phoneNumberId: "123",
      hasAccessToken: true,
      isTestMode: true,
      meta: { lastInboundAt: "2026-06-21T09:00:00.000Z" },
    });
    const connectedHealth = summarizeWhatsappConnectionHealth({
      connectionStatus: "connected",
      phoneNumberId: "456",
      hasAccessToken: true,
      meta: { lastFailureMessage: "temporary issue" },
    });

    expect(testHealth.mode).toBe("test_mode");
    expect(testHealth.channelMode).toBe("demo_test_number");
    expect(testHealth.tokenSource).toBe("demo_test_number");
    expect(connectedHealth.mode).toBe("connected");
    expect(connectedHealth.channelMode).toBe("tenant_cloud_api");
    expect(connectedHealth.tokenSource).toBe("tenant_cloud_api");
    expect(connectedHealth.lastFailureMessage).toBe("temporary issue");
  });
});
