-- 크론 실행 기록. 돌았는지 · 성공했는지 · 무엇을 했는지를 실행마다 한 줄 남긴다.
--
-- 실행 기록이 남는 크론이 evo 계열뿐이라, 2026년에 발견한 무증상 실패 세 건을 전부 몇 달 뒤에야
-- DB 부산물로 역추적해야 했다. 실패 모양이 셋 다 달랐다 — 예외(evo-promote), 404(스냅숏),
-- 그리고 "성공인데 결과가 0"(커뮤니티 임포트). 마지막 것 때문에 성공 여부만으로는 부족하고
-- 산출량(stats)까지 남겨야 한다.

DO $$ BEGIN
  CREATE TYPE "cron_run_status" AS ENUM('success', 'failure');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "job_name" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  "duration_ms" integer NOT NULL,
  "status" "cron_run_status" NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_runs_job_started_idx" ON "cron_runs" ("job_name","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cron_runs_started_at_idx" ON "cron_runs" ("started_at");
