-- step-33: richer form analytics events.
-- Enables funnel/drop-off tracking beyond plain form_view and form_submit.

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'form_start';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'form_step_view';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'form_abandon';
