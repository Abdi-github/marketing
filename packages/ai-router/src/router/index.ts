// ProviderRouter — selects an IAIProvider per call based on plan, health, and cost.
// See docs/AI_GUIDELINES.md §Provider routing and docs/ADRs/0003.
//
// Design: ProviderRouter does NOT import @marketing/db. The caller (worker)
// injects a writeUsage callback so that ai-router stays within its allowed dep set.
import { logger } from "@marketing/shared";
import { BudgetExceededError } from "../interface";
import type {
  CallOpts,
  CompletionInput,
  CompletionOutput,
  EmbedInput,
  EmbedOutput,
  IAIProvider,
  ToolDefinition,
  ToolUseOutput,
} from "../interface";

export type UsageRecord = {
  tenantId: string;
  jobId: string;
  provider: string;
  model: string;
  promptId: string;
  promptVersion: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type RouteOpts = {
  /** The tenant's plan tier. Drives model selection. */
  tenantPlan: string;
  /** Called after every successful completion to persist usage. */
  writeUsage: (record: UsageRecord) => Promise<void>;
};

export type ProviderRouterConfig = {
  /** Primary provider for trial-tier tenants (cheaper model). */
  trial: IAIProvider;
  /** Primary provider for growth+ tenants (higher-quality model). */
  primary: IAIProvider;
  /** Fallback when primary is unhealthy. */
  fallback: IAIProvider;
};

export class ProviderRouter {
  private readonly config: ProviderRouterConfig;

  constructor(config: ProviderRouterConfig) {
    this.config = config;
  }

  private selectPrimary(tenantPlan: string): IAIProvider {
    return tenantPlan === "trial" ? this.config.trial : this.config.primary;
  }

  async route(
    input: CompletionInput,
    opts: CallOpts,
    routeOpts: RouteOpts,
  ): Promise<CompletionOutput> {
    const primary = this.selectPrimary(routeOpts.tenantPlan);
    let result: CompletionOutput;
    let usedProvider = primary;

    try {
      const healthy = await primary.isHealthy();
      if (!healthy) {
        logger.warn(
          { provider: primary.id, tenantId: opts.tenantId, jobId: opts.jobId },
          "[router] primary unhealthy — falling back",
        );
        usedProvider = this.config.fallback;
      }
      result = await usedProvider.complete(input, opts);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await routeOpts.writeUsage({
          tenantId: opts.tenantId,
          jobId: opts.jobId,
          provider: err.usage.provider,
          model: err.usage.model,
          promptId: opts.promptId,
          promptVersion: opts.promptVersion,
          inputTokens: err.usage.inputTokens,
          outputTokens: err.usage.outputTokens,
          costUsd: err.usage.costUsd,
        });
        throw err;
      }

      logger.warn(
        { provider: usedProvider.id, err: String(err), jobId: opts.jobId },
        "[router] primary attempt failed — trying fallback",
      );

      if (usedProvider === this.config.fallback) throw err;
      usedProvider = this.config.fallback;
      result = await usedProvider.complete(input, opts);
    }

    await routeOpts.writeUsage({
      tenantId: opts.tenantId,
      jobId: opts.jobId,
      provider: result.provider,
      model: result.model,
      promptId: opts.promptId,
      promptVersion: opts.promptVersion,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });

    logger.info(
      {
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd.toFixed(6),
        latencyMs: result.latencyMs,
        jobId: opts.jobId,
      },
      "[router] completion done",
    );

    return result;
  }

  /**
   * Route a tool-use call. Only uses the primary provider — tool-use is not
   * retried on the plain-text fallback (which may not support tools).
   */
  async routeWithTools(
    input: CompletionInput,
    tools: ToolDefinition[],
    opts: CallOpts,
    routeOpts: RouteOpts,
  ): Promise<ToolUseOutput> {
    const primary = this.selectPrimary(routeOpts.tenantPlan);

    if (!primary.completionWithTools) {
      throw new Error(
        `[router] provider ${primary.id} does not support completionWithTools`,
      );
    }

    let result: ToolUseOutput;
    try {
      result = await primary.completionWithTools(input, tools, opts);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await routeOpts.writeUsage({
          tenantId: opts.tenantId,
          jobId: opts.jobId,
          provider: err.usage.provider,
          model: err.usage.model,
          promptId: opts.promptId,
          promptVersion: opts.promptVersion,
          inputTokens: err.usage.inputTokens,
          outputTokens: err.usage.outputTokens,
          costUsd: err.usage.costUsd,
        });
      }
      throw err;
    }

    await routeOpts.writeUsage({
      tenantId: opts.tenantId,
      jobId: opts.jobId,
      provider: result.provider,
      model: result.model,
      promptId: opts.promptId,
      promptVersion: opts.promptVersion,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });

    logger.info(
      {
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd.toFixed(6),
        latencyMs: result.latencyMs,
        jobId: opts.jobId,
      },
      "[router] tool-use completion done",
    );

    return result;
  }

  /**
   * Route an embedding call. Does not fall back — embeddings must come from a
   * capable provider (Anthropic). If the primary doesn't support embed, throws.
   */
  async routeEmbed(
    input: EmbedInput,
    opts: CallOpts,
    routeOpts: RouteOpts,
  ): Promise<EmbedOutput> {
    const primary = this.selectPrimary(routeOpts.tenantPlan);

    if (!primary.embed) {
      throw new Error(`[router] provider ${primary.id} does not support embed`);
    }

    let result: EmbedOutput;
    try {
      result = await primary.embed(input, opts);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await routeOpts.writeUsage({
          tenantId: opts.tenantId,
          jobId: opts.jobId,
          provider: err.usage.provider,
          model: err.usage.model,
          promptId: opts.promptId,
          promptVersion: opts.promptVersion,
          inputTokens: err.usage.inputTokens,
          outputTokens: 0,
          costUsd: err.usage.costUsd,
        });
      }
      throw err;
    }

    await routeOpts.writeUsage({
      tenantId: opts.tenantId,
      jobId: opts.jobId,
      provider: result.provider,
      model: result.model,
      promptId: opts.promptId,
      promptVersion: opts.promptVersion,
      inputTokens: result.inputTokens,
      outputTokens: 0,
      costUsd: result.costUsd,
    });

    logger.info(
      {
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        costUsd: result.costUsd.toFixed(6),
        latencyMs: result.latencyMs,
        jobId: opts.jobId,
      },
      "[router] embed done",
    );

    return result;
  }
}
