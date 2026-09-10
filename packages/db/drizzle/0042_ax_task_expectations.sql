-- Explicit plans are separate from telemetry; no existing batch or review is rewritten.
CREATE TABLE ax_task_expectations (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  agent_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX ax_task_expectations_scope_idx ON ax_task_expectations(org_id, agent_id);
