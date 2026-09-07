-- gpters.org 도메인 밖이지만 로그인을 허용한 계정 목록.
-- 슈퍼 어드민이 어드민 화면에서 직접 관리하며, 여기서 지우면 접근이 즉시 끊긴다.
CREATE TABLE IF NOT EXISTS "allowed_external_accounts" (
  "email" text PRIMARY KEY NOT NULL,
  "note" text,
  "added_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "allowed_external_accounts"
  ADD CONSTRAINT "allowed_external_accounts_added_by_user_id_users_id_fk"
  FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
-- 코드 상수로 관리하던 기존 승인 계정을 그대로 옮긴다. 승인자 기록은 남아 있지 않다.
INSERT INTO "allowed_external_accounts" ("email", "note") VALUES
  ('zeusajm@yonsei.ac.kr', '코드 허용 목록에서 이관'),
  ('qgq214@gmail.com', '코드 허용 목록에서 이관')
ON CONFLICT ("email") DO NOTHING;
