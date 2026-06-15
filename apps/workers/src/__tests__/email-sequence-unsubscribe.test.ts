import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  withUnsubscribeFooter,
} from "../queues/email-sequence-tick/unsubscribe";

describe("email sequence unsubscribe helpers", () => {
  it("builds an unsubscribe URL from APP_URL and send id", () => {
    const url = buildUnsubscribeUrl(
      "https://app.example.ch/",
      "00000000-0000-4000-8000-000000000123",
    );

    expect(url).toBe(
      "https://app.example.ch/api/email/preferences?send_id=00000000-0000-4000-8000-000000000123",
    );
  });

  it("injects unsubscribe footer into html body and plain text", () => {
    const result = withUnsubscribeFooter(
      "<html><body><p>Hello</p></body></html>",
      "Hello",
      "https://app.example.ch/api/email/preferences?send_id=s1",
    );

    expect(result.html).toContain("Manage preferences or unsubscribe");
    expect(result.html).toContain("</body>");
    expect(result.html.indexOf("Manage preferences")).toBeLessThan(result.html.indexOf("</body>"));
    expect(result.text).toContain(
      "Manage preferences or unsubscribe: https://app.example.ch/api/email/preferences?send_id=s1",
    );
  });
});
