import {
  INTEGRATION_SYNC_QUEUE_NAME,
  integrationSyncJobSchema,
  type IntegrationSyncJob,
} from "@marketing/ai-router";
import { db, integrationConnections, integrationSyncRuns, tenants } from "@marketing/db";
import type { IntegrationConnection, IIntegrationAdapter } from "@marketing/integrations";
import {
  EversportsAdapter,
  GastrofixAdapter,
  LightspeedChAdapter,
  MetaAdapter,
} from "@marketing/integrations";
import { env, hashId, logger, recordMetric } from "@marketing/shared";
import type { TenantContext } from "@marketing/tenancy";
import type { Job } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { connection } from "./queue";

function getAdapter(provider: string): IIntegrationAdapter {
  const encKey = env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) {
    throw new UnrecoverableError("INTEGRATION_ENCRYPTION_KEY is not configured");
  }

  switch (provider) {
    case "gastrofix":
      return new GastrofixAdapter(db, encKey);
    case "lightspeed_ch":
      return new LightspeedChAdapter(db, encKey);
    case "eversports":
      return new EversportsAdapter(db, encKey);
    case "meta": {
      if (!env.META_APP_ID || !env.META_APP_SECRET) {
        throw new UnrecoverableError("Meta integration is not configured");
      }
      return new MetaAdapter(
        db,
        encKey,
        env.META_APP_ID,
        env.META_APP_SECRET,
        `${env.APP_URL}/api/integrations/meta/callback`,
      );
    }
    default:
      throw new UnrecoverableError(`Sync is not implemented for provider: ${provider}`);
  }
}

function mapConnection(row: typeof integrationConnections.$inferSelect): IntegrationConnection {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    oauthTokens: row.oauthTokens,
    scopes: row.scopes ?? [],
    status: row.status as IntegrationConnection["status"],
    meta: (row.meta ?? {}) as Record<string, unknown>,
    connectedAt: row.connectedAt,
    lastSyncAt: row.lastSyncAt ?? null,
    updatedAt: row.updatedAt,
  };
}

function outcomeToRunStatus(outcome: string): "success" | "partial" | "noop" | "error" {
  if (outcome === "ok") return "success";
  if (outcome === "partial") return "partial";
  if (outcome === "noop") return "noop";
  return "error";
}

async function isTenantSuspended(tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row?.suspended ?? false;
}

export async function handleIntegrationSyncJob(job: Job<IntegrationSyncJob>): Promise<void> {
  const data = integrationSyncJobSchema.parse(job.data);
  const startedAt = new Date();

  await db
    .update(integrationSyncRuns)
    .set({ status: "running", startedAt, updatedAt: startedAt })
    .where(
      and(
        eq(integrationSyncRuns.id, data.syncRunId),
        eq(integrationSyncRuns.tenantId, data.tenantId),
      ),
    );

  try {
    if (await isTenantSuspended(data.tenantId)) {
      throw new UnrecoverableError(`Tenant ${data.tenantId} is suspended`);
    }

    const [row] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, data.connectionId),
          eq(integrationConnections.tenantId, data.tenantId),
        ),
      );

    if (!row) {
      throw new UnrecoverableError("Connection not found");
    }

    if (row.status !== "connected") {
      throw new UnrecoverableError(`Connection is ${row.status}`);
    }

    const tenantCtx: TenantContext = {
      tenantId: data.tenantId,
      userId: "00000000-0000-0000-0000-000000000000",
      role: "admin",
    };
    const adapter = getAdapter(row.provider);
    const result = await adapter.sync(tenantCtx, mapConnection(row));
    const completedAt = new Date();
    const runStatus = outcomeToRunStatus(result.outcome);

    await db
      .update(integrationSyncRuns)
      .set({
        status: runStatus,
        recordsProcessed: result.recordsProcessed,
        errorMessage: result.errorMessage ?? null,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(integrationSyncRuns.id, data.syncRunId));

    recordMetric("integration.sync.completed", {
      provider: data.provider,
      outcome: result.outcome,
      tenantIdHash: hashId(data.tenantId),
    });

    logger.info(
      {
        tenantId: data.tenantId,
        provider: data.provider,
        connectionId: data.connectionId,
        syncRunId: data.syncRunId,
        outcome: result.outcome,
        recordsProcessed: result.recordsProcessed,
      },
      "[integration-sync] completed",
    );
  } catch (err) {
    const completedAt = new Date();
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(integrationSyncRuns)
      .set({
        status: "error",
        errorMessage,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(integrationSyncRuns.id, data.syncRunId));

    recordMetric("integration.sync.failed", {
      provider: data.provider,
      tenantIdHash: hashId(data.tenantId),
    });

    logger.error(
      {
        tenantId: data.tenantId,
        provider: data.provider,
        connectionId: data.connectionId,
        syncRunId: data.syncRunId,
        err: errorMessage,
      },
      "[integration-sync] failed",
    );

    throw err;
  }
}

export const integrationSyncWorker = new Worker<IntegrationSyncJob>(
  INTEGRATION_SYNC_QUEUE_NAME,
  handleIntegrationSyncJob,
  {
    connection,
    concurrency: 5,
  },
);

integrationSyncWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[integration-sync] BullMQ job completed");
});

integrationSyncWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[integration-sync] BullMQ job failed");
});
