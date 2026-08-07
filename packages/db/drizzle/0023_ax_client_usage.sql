-- AX 대시보드: 팀원별 AI 클라이언트 사용량 테이블
-- 원본은 각 팀원 머신의 트랜스크립트다. 서버에는 집계 결과만 들어온다 —
-- 대화 내용도 인증 토큰도 저장하지 않는다.
-- 갱신: pnpm --filter @gpters/db exec tsx scripts/import-ax-usage.ts <json>

DO $$ BEGIN
  CREATE TYPE "ax_usage_client" AS ENUM ('claude-code', 'codex');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ax_client_usage" (
  "id" text PRIMARY KEY NOT NULL,
  "member_name" text NOT NULL,
  "client" "ax_usage_client" NOT NULL,
  "plan_raw" text,
  "plan" text,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  -- integer(약 21억)로는 부족하다. 주간 캐시 읽기만으로 40억을 넘는다.
  "input_tokens" bigint DEFAULT 0 NOT NULL,
  "output_tokens" bigint DEFAULT 0 NOT NULL,
  "cached_tokens" bigint DEFAULT 0 NOT NULL,
  "sessions" integer DEFAULT 0 NOT NULL,
  "models" jsonb DEFAULT '{}'::jsonb,
  -- NULL은 "한도를 안 썼다"가 아니라 "클라이언트가 한도를 보고하지 않는다"는 뜻이다.
  -- Claude Code는 한도 정보를 로컬에 남기지 않아 항상 NULL이다.
  "limit_used_percent" numeric(5, 2),
  "limit_resets_at" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_client_usage_member_idx" ON "ax_client_usage" ("member_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_client_usage_client_idx" ON "ax_client_usage" ("client");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_client_usage_period_idx" ON "ax_client_usage" ("period_start");
--> statement-breakpoint

-- 같은 사람·클라이언트·기간은 한 행이다. 재수집 시 덮어쓰기 위한 키.
CREATE UNIQUE INDEX IF NOT EXISTS "ax_client_usage_unique_idx"
  ON "ax_client_usage" ("member_name", "client", "period_start");
