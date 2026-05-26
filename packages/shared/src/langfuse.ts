// No-op Langfuse stub for skeleton — replace with real client in Phase 4 (AI workflow).
// API surface matches what ai-router will call so the swap is mechanical.

export type LangfuseTrace = {
  id: string;
  update: (_data: Record<string, unknown>) => void;
};

export function createTrace(_name: string): LangfuseTrace {
  const id = `noop-${Date.now()}`;
  return {
    id,
    update: (_data) => {
      // no-op
    },
  };
}

export async function flushLangfuse(): Promise<void> {
  return Promise.resolve();
}
