-- Private, internal-only operator decisions. Revision guards prevent lost updates.
CREATE TABLE IF NOT EXISTS "ax_incident_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "revision" integer NOT NULL CHECK ("revision" > 0),
  "record" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
