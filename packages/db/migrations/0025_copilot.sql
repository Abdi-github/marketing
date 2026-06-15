-- step-30: Conversational AI copilot — thread + message persistence.
-- ADR-0025: default-deny on irreversible actions; all copilot-invoked mutations in audit_log.

CREATE TABLE copilot_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX copilot_threads_tenant_user_idx ON copilot_threads (tenant_id, user_id);
ALTER TABLE copilot_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY copilot_threads_tenant_isolation ON copilot_threads
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

-- ─── Messages ────────────────────────────────────────────────────────────────

CREATE TABLE copilot_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  -- Proposed tool calls (when role='assistant' and action is pending confirm).
  pending_actions  JSONB,
  -- Results after actions were confirmed and executed.
  action_results   JSONB,
  -- NULL = no action proposed; FALSE = awaiting confirm; TRUE = confirmed/executed.
  confirmed        BOOLEAN,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX copilot_messages_thread_idx ON copilot_messages (thread_id, created_at);
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY copilot_messages_tenant_isolation ON copilot_messages
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
