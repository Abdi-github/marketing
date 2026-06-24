import type { SequenceTriggerFilter } from "@marketing/db";

export function matchesTriggerFilter(
  eventType: string,
  payload: Record<string, unknown>,
  filter: SequenceTriggerFilter,
): boolean {
  if (eventType === "lead.captured") {
    if (filter.lifecycle_stage && payload.lifecycleStage !== filter.lifecycle_stage) return false;
    if (filter.leadKind && payload.leadKind !== filter.leadKind) return false;
    if (filter.sourceChannel && payload.sourceChannel !== filter.sourceChannel) return false;
    if (filter.formId && payload.formId !== filter.formId) return false;
    if (filter.landingPageId && payload.landingPageId !== filter.landingPageId) return false;
    if (filter.requireMarketingConsent && payload.marketingConsent !== true) return false;
    return true;
  }
  if (eventType === "contact.score_changed") {
    if (filter.min_delta !== undefined) {
      const delta = typeof payload.delta === "number" ? payload.delta : 0;
      if (delta < filter.min_delta) return false;
    }
    if (filter.min_score !== undefined) {
      const score = typeof payload.newScore === "number" ? payload.newScore : 0;
      if (score < filter.min_score) return false;
    }
    return true;
  }
  if (eventType === "contact.lifecycle_changed") {
    if (filter.lifecycle_stage && payload.newStage !== filter.lifecycle_stage) return false;
    return true;
  }
  return true;
}
