export type ReservationFacts = {
  reservationDate?: string;
  reservationTime?: string;
  partySize?: string;
};

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function extractReservationFactsFromText(text: string, now = new Date()): ReservationFacts {
  const body = text.trim();
  const facts: ReservationFacts = {};

  const explicitIsoDate = body.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const europeanDate = body.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (explicitIsoDate) {
    facts.reservationDate = `${explicitIsoDate[1]}-${explicitIsoDate[2]}-${explicitIsoDate[3]}`;
  } else if (europeanDate) {
    facts.reservationDate = `${europeanDate[3]}-${europeanDate[2]!.padStart(2, "0")}-${europeanDate[1]!.padStart(2, "0")}`;
  } else if (/\btomorrow\b/i.test(body)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    facts.reservationDate = formatIsoDate(tomorrow);
  }

  const time = body.match(/\b([01]?\d|2[0-3])(?:[:.h])([0-5]\d)\b/i);
  if (time) {
    facts.reservationTime = `${time[1]!.padStart(2, "0")}:${time[2]}`;
  }

  const party =
    body.match(
      /\b(?:party\s*of|table\s*for|reservation\s*for|for)\s*(\d{1,2})\s*(?:people|persons|guests?|pax)?\b/i,
    ) ??
    body.match(/\b(\d{1,2})\s*(?:people|persons|guests?|pax)\b/i) ??
    body.match(/\b(?:party|people|persons|guests?)\s*(?:of|:)?\s*(\d{1,2})\b/i);
  if (party?.[1]) {
    facts.partySize = party[1];
  }

  return facts;
}

export function missingReservationFactNames(
  facts: Record<string, unknown>,
): Array<"date" | "time" | "party size"> {
  const hasText = (value: unknown) =>
    (typeof value === "string" && value.trim().length > 0) ||
    (typeof value === "number" && Number.isFinite(value));
  const missing: Array<"date" | "time" | "party size"> = [];
  if (!hasText(facts["reservationDate"]) && !hasText(facts["date"])) missing.push("date");
  if (!hasText(facts["reservationTime"]) && !hasText(facts["time"])) missing.push("time");
  if (
    !hasText(facts["partySize"]) &&
    !hasText(facts["party_size"]) &&
    !hasText(facts["guest_count"]) &&
    !hasText(facts["guests"])
  ) {
    missing.push("party size");
  }
  return missing;
}
