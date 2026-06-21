ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS policy_state text,
ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE crm_tasks
ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS workflow_kind text,
ADD COLUMN IF NOT EXISTS workflow_state text,
ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'form',
ADD COLUMN IF NOT EXISTS structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_automation_at timestamptz;
