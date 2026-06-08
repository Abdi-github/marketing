import { createHash } from "crypto";
import { logger } from "./logger";

/**
 * Thin structured-log metrics sink.
 *
 * Emits Pino log entries with { metric: true, metricName, ...tags } that
 * Grafana Loki can scrape as log-based metrics. Call sites are identical to
 * what an OTel counter would look like, so Phase 8 can replace the body with
 * NodeSDK meter calls without changing any instrumentation in workers or web.
 *
 * Alert conditions covered (per plan §Observability and OBSERVABILITY.md):
 *   ai.job.completed / ai.job.failed  → job error rate
 *   ai.provider.error                 → provider error rate
 *   ai.cost.recorded                  → per-tenant cost spike detection
 *   integration.sync.completed/failed → integration health
 */
export function recordMetric(name: string, tags: Record<string, unknown> = {}): void {
  logger.info({ metric: true, metricName: name, ...tags }, `[metric] ${name}`);
}

/**
 * Returns the first 8 hex chars of SHA-256(id).
 * Use in metrics/logs to identify a tenant without exposing the raw UUID.
 */
export function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}
