-- 클라이언트 사용량의 소유자를 표시명이 아니라 인증 user_id로 고정한다.
ALTER TABLE "ax_client_usage"
  ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ax_client_usage"
    ADD CONSTRAINT "ax_client_usage_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 이름 또는 이메일 로컬파트가 정확히 한 사용자에게만 대응할 때만 기존 행을 연결한다.
WITH identity_matches AS (
  SELECT
    usage.id AS usage_id,
    min(member.id) AS user_id,
    count(DISTINCT member.id) AS match_count
  FROM "ax_client_usage" AS usage
  JOIN "users" AS member
    ON lower(trim(usage."member_name")) = lower(trim(coalesce(member."name", '')))
    OR lower(trim(usage."member_name")) = lower(split_part(member."email", '@', 1))
  WHERE usage."user_id" IS NULL
  GROUP BY usage.id
)
UPDATE "ax_client_usage" AS usage
SET "user_id" = identity_matches.user_id
FROM identity_matches
WHERE usage.id = identity_matches.usage_id
  AND identity_matches.match_count = 1;
--> statement-breakpoint

-- 같은 사용자의 같은 구간이 이름 변경 등으로 중복된 경우 가장 최근 보고만 보존한다.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "user_id", "client", "period_start"
      ORDER BY "synced_at" DESC, "updated_at" DESC NULLS LAST, id DESC
    ) AS row_number
  FROM "ax_client_usage"
  WHERE "user_id" IS NOT NULL
)
DELETE FROM "ax_client_usage"
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_client_usage_user_idx"
  ON "ax_client_usage" ("user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ax_client_usage_user_client_period_uidx"
  ON "ax_client_usage" ("user_id", "client", "period_start")
  WHERE "user_id" IS NOT NULL;
