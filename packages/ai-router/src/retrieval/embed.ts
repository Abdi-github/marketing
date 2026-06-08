// pgvector retrieval helpers for the landing-page copy step.
// embedTenantContext: generates + caches an embedding for a content chunk.
// findRelevantContext: cosine-similarity search over brand_embeddings.
//
// Design: ai-router does NOT import @marketing/db. The caller (worker) injects
// the DB handle via the EmbedStore interface so that ai-router stays within its
// allowed dep set (ADR-0005 / module boundary rules).
import { createHash } from "crypto";
import type { IAIProvider } from "../interface";

export type BrandChunk = {
  id: string;
  tenantId: string;
  contentType: string;
  contentText: string;
  contentHash: string;
  embedding: number[] | null;
};

/**
 * Minimal DB interface injected by the worker. Keeps ai-router free of @marketing/db.
 */
export type EmbedStore = {
  findByHash(tenantId: string, contentHash: string): Promise<BrandChunk | null>;
  upsert(chunk: Omit<BrandChunk, "id"> & { id?: string }): Promise<void>;
  findAll(tenantId: string): Promise<BrandChunk[]>;
};

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * Embed a single text string and persist to brand_embeddings via store.
 * Idempotent: if a row with the same hash already exists, returns immediately.
 */
export async function embedTenantContext(
  tenantId: string,
  contentType: string,
  text: string,
  provider: IAIProvider,
  store: EmbedStore,
  opts: { jobId: string; costBudgetCents: number },
): Promise<void> {
  if (!provider.embed) return; // provider doesn't support embeddings → skip silently

  const hash = contentHash(text);
  const existing = await store.findByHash(tenantId, hash);
  if (existing?.embedding != null) return; // already embedded

  const result = await provider.embed(
    { texts: [text], contentHashes: [hash] },
    {
      tenantId,
      jobId: opts.jobId,
      promptId: "embed-v1",
      promptVersion: 1,
      costBudgetCents: opts.costBudgetCents,
    },
  );

  await store.upsert({
    tenantId,
    contentType,
    contentText: text,
    contentHash: hash,
    embedding: result.embeddings[0] ?? null,
  });
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Find the k most relevant brand context chunks for a query string.
 * Returns an empty array if the tenant has no embeddings yet.
 * Falls back to exact search (no pgvector operator) — adequate at MVP scale.
 */
export async function findRelevantContext(
  tenantId: string,
  query: string,
  provider: IAIProvider,
  store: EmbedStore,
  opts: { jobId: string; costBudgetCents: number; k?: number },
): Promise<string[]> {
  const k = opts.k ?? 3;

  if (!provider.embed) return []; // embeddings not supported → no retrieval

  const all = await store.findAll(tenantId);
  if (all.length === 0) return [];

  // Embed the query.
  const queryResult = await provider.embed(
    { texts: [query] },
    {
      tenantId,
      jobId: opts.jobId,
      promptId: "embed-query-v1",
      promptVersion: 1,
      costBudgetCents: opts.costBudgetCents,
    },
  );
  const queryVec = queryResult.embeddings[0];
  if (!queryVec) return [];

  // Score all chunks with a stored embedding.
  const scored = all
    .filter((c) => c.embedding != null)
    .map((c) => ({ text: c.contentText, score: cosineSim(queryVec, c.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((c) => c.text);

  return scored;
}
