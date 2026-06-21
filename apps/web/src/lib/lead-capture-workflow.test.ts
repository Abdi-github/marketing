import { describe, expect, it } from "vitest";
import {
  buildLeadConfirmationCopy,
  buildLeadTaskDueAt,
  buildLeadWorkflowPlan,
  buildPhoneLeadPlaceholderEmail,
  getLeadConfirmationChannelOrder,
  inferLeadWorkflowKind,
  isPlaceholderLeadEmail,
  normalizeLeadCaptureSettings,
  splitContactName,
} from "@marketing/shared";

describe("lead-capture-workflow", () => {
  it("classifies restaurant reservation payloads as booking", () => {
    const kind = inferLeadWorkflowKind(
      {
        name: "Reservation request",
        slug: "reservation-request",
        submitLabel: "Book now",
        steps: [
          {
            title: "Reservation",
            fields: [
              { name: "name", label: "Name", type: "text" },
              { name: "date", label: "Date", type: "text" },
              { name: "party_size", label: "Guests", type: "number" },
            ],
          },
        ],
      },
      { name: "Nina", date: "2026-06-22", party_size: 4 },
    );

    expect(kind).toBe("booking");
  });

  it("classifies phone-first callback payloads as callback", () => {
    const kind = inferLeadWorkflowKind(
      {
        name: "Request a callback",
        slug: "callback-request",
        submitLabel: "Call me back",
        steps: [
          {
            title: "Call me",
            fields: [
              { name: "phone", label: "Phone", type: "tel" },
              { name: "preferred_time", label: "Best time", type: "text" },
            ],
          },
        ],
      },
      { phone: "+41790001122", preferred_time: "Tomorrow morning" },
    );

    expect(kind).toBe("callback");
  });

  it("classifies service inquiries as quote", () => {
    const kind = inferLeadWorkflowKind(
      {
        name: "Request an offer",
        slug: "quote-request",
        submitLabel: "Get a quote",
        schema: {
          type: "object",
          properties: {
            email: { type: "string" },
            service: { type: "string" },
            message: { type: "string" },
          },
        },
      },
      {
        email: "hello@example.com",
        service: "Catering for office event",
        message: "Please send pricing for 40 people.",
      },
    );

    expect(kind).toBe("quote");
  });

  it("builds an urgent booking follow-up plan", () => {
    const plan = buildLeadWorkflowPlan(
      {
        name: "Reservation form",
        slug: "reservation-form",
        submitLabel: "Reserve",
        schema: {},
      },
      {
        name: "Nina",
        date: "2026-06-22",
        time: "19:30",
        party_size: 4,
        message: "Window seat please",
      },
      "https://abdi-restaurant.ch/reserve",
    );

    expect(plan.kind).toBe("booking");
    expect(plan.priority).toBe("high");
    expect(plan.title).toContain("reservation");
    expect(plan.body).toContain("Guests: 4");
    expect(plan.dueInHours).toBe(1);
  });

  it("creates deterministic placeholder emails for phone-only leads", () => {
    expect(buildPhoneLeadPlaceholderEmail("+41 79 000 11 22")).toBe(
      "lead-plus-41790001122@noreply.form",
    );
  });

  it("splits common full-name payloads", () => {
    expect(splitContactName({ name: "Nina Weber" })).toEqual({
      firstName: "Nina",
      lastName: "Weber",
    });
  });

  it("builds due dates from workflow urgency", () => {
    const dueAt = buildLeadTaskDueAt(
      {
        kind: "callback",
        priority: "high",
        title: "Call back new lead",
        body: "Test",
        dueInHours: 2,
      },
      new Date("2026-06-20T10:00:00.000Z"),
    );

    expect(dueAt.toISOString()).toBe("2026-06-20T12:00:00.000Z");
  });

  it("builds localized booking confirmation copy", () => {
    const copy = buildLeadConfirmationCopy({
      kind: "booking",
      businessName: "Abdi Restaurant",
      locale: "en",
      payload: { date: "2026-06-22", time: "19:30", party_size: 4 },
    });

    expect(copy.subject).toContain("Abdi Restaurant");
    expect(copy.body).toContain("Guests: 4");
    expect(copy.shortBody).toContain("booking");
  });

  it("applies tenant confirmation wording overrides", () => {
    const copy = buildLeadConfirmationCopy({
      kind: "booking",
      businessName: "Abdi Restaurant",
      locale: "en",
      payload: { date: "2026-06-22" },
      settings: {
        reservationConfirmationMessage:
          "Thanks for your reservation request. We will confirm your table shortly.",
      },
    });

    expect(copy.subject).toContain("Abdi Restaurant");
    expect(copy.body).toBe(
      "Thanks for your reservation request. We will confirm your table shortly.",
    );
    expect(copy.shortBody).toContain("reservation");
  });

  it("normalizes lead capture settings and channel preference ordering", () => {
    const settings = normalizeLeadCaptureSettings({
      preferredConfirmationChannel: "whatsapp",
      genericConfirmationMessage: "Hello there",
    });

    expect(settings.preferredConfirmationChannel).toBe("whatsapp");
    expect(settings.genericConfirmationMessage).toBe("Hello there");
    expect(getLeadConfirmationChannelOrder(settings.preferredConfirmationChannel)).toEqual([
      "whatsapp",
      "email",
      "sms",
    ]);
  });

  it("detects placeholder lead emails", () => {
    expect(isPlaceholderLeadEmail("lead-plus-41790001122@noreply.form")).toBe(true);
    expect(isPlaceholderLeadEmail("hello@example.com")).toBe(false);
  });
});
