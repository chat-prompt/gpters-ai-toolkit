-- 단발 CLI의 탐색→로드→실행 흐름은 journey_id로 연결하고,
-- MCP transport session은 있을 때만 보조 정보로 보존한다.
ALTER TABLE "skill_events" ADD COLUMN "journey_id" text;
--> statement-breakpoint
CREATE INDEX "skill_events_journey_idx"
  ON "skill_events" USING btree ("journey_id");
--> statement-breakpoint

ALTER TABLE "ax_skill_execution_attempts"
  ALTER COLUMN "session_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ax_skill_execution_attempts" ADD COLUMN "journey_id" text;
--> statement-breakpoint
CREATE INDEX "ax_skill_execution_attempts_journey_idx"
  ON "ax_skill_execution_attempts" USING btree ("journey_id");
