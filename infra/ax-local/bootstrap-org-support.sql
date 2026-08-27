-- The organization rollout was originally performed by the programmatic
-- packages/db/src/migrations/add-org-support.ts flow rather than a checked-in
-- Drizzle SQL migration. Recreate its schema prerequisite for clean local DBs.
-- Local isolation only: this file does not create an organization or migrate data.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'super_admin';

DO $$ BEGIN
  CREATE TYPE "org_role" AS ENUM ('org_admin', 'org_editor', 'org_viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "visibility" AS ENUM ('private', 'public');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "org_invitation_status" AS ENUM ('pending', 'accepted', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "org_memberships" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" "org_role" DEFAULT 'org_viewer' NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now(),
  "invited_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  PRIMARY KEY ("user_id", "org_id")
);

CREATE INDEX IF NOT EXISTS "org_memberships_user_id_idx" ON "org_memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "org_memberships_org_id_idx" ON "org_memberships" ("org_id");

CREATE TABLE IF NOT EXISTS "org_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "org_role" DEFAULT 'org_viewer' NOT NULL,
  "status" "org_invitation_status" DEFAULT 'pending' NOT NULL,
  "invited_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "org_invitations_email_org_status_idx"
  ON "org_invitations" ("email", "org_id", "status");
CREATE INDEX IF NOT EXISTS "org_invitations_org_id_idx" ON "org_invitations" ("org_id");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rona_user_id" text;

ALTER TABLE "catalog_items"
  ADD COLUMN IF NOT EXISTS "author_id" text,
  ADD COLUMN IF NOT EXISTS "org_id" text,
  ADD COLUMN IF NOT EXISTS "visibility" "visibility" DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS "forked_from" text,
  ADD COLUMN IF NOT EXISTS "fork_count" integer DEFAULT 0 NOT NULL;

DO $$ BEGIN
  ALTER TABLE "catalog_items"
    ADD CONSTRAINT "catalog_items_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "catalog_items"
    ADD CONSTRAINT "catalog_items_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "catalog_items_author_id_idx" ON "catalog_items" ("author_id");
CREATE INDEX IF NOT EXISTS "catalog_items_org_id_idx" ON "catalog_items" ("org_id");
CREATE INDEX IF NOT EXISTS "catalog_items_visibility_idx" ON "catalog_items" ("visibility");
CREATE INDEX IF NOT EXISTS "catalog_items_forked_from_idx" ON "catalog_items" ("forked_from");
