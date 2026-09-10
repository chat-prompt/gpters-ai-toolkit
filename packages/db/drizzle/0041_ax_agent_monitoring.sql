CREATE TABLE ax_monitor_state (
  id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 0,
  record jsonb NOT NULL,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE ax_monitor_processed_batches (
  monitor_id text NOT NULL REFERENCES ax_monitor_state(id),
  batch_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, batch_id)
);
--> statement-breakpoint
CREATE TABLE ax_monitor_outbox (
  id text PRIMARY KEY,
  monitor_id text NOT NULL REFERENCES ax_monitor_state(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_until timestamptz,
  claim_id text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX ax_monitor_outbox_pending_idx ON ax_monitor_outbox(status, available_at);
--> statement-breakpoint
CREATE TABLE ax_report_inboxes (
  id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 0,
  registration jsonb NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX ax_incident_reviews_history_idx ON ax_incident_reviews(updated_at DESC,id DESC);
--> statement-breakpoint
CREATE TABLE ax_monitor_deferred_batches (
 monitor_id text NOT NULL REFERENCES ax_monitor_state(id), batch_id text NOT NULL,
 reason text NOT NULL, retry_after timestamptz NOT NULL,
 PRIMARY KEY(monitor_id,batch_id)
);
