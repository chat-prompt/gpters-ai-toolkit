-- 사용자 계정과 조직 소속의 생명주기를 분리한다.
-- 퇴사자를 삭제하지 않아 과거 AX 사용량과 감사 관계를 보존하면서,
-- 현재 접근 권한과 구성원 분모에서는 제외할 수 있다.
DO $$ BEGIN
  CREATE TYPE "user_account_status" AS ENUM ('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "org_membership_status" AS ENUM ('active', 'offboarded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "account_status" "user_account_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deactivation_reason" text;
--> statement-breakpoint

ALTER TABLE "org_memberships"
  ADD COLUMN IF NOT EXISTS "status" "org_membership_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "ended_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deactivated_by" text,
  ADD COLUMN IF NOT EXISTS "deactivation_reason" text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "org_memberships"
    ADD CONSTRAINT "org_memberships_deactivated_by_users_id_fk"
    FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "org_memberships_org_status_idx"
  ON "org_memberships" ("org_id", "status");
