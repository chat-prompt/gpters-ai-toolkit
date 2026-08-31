-- 세션 없는 AITK CLI 호출도 실제 상호작용 사건으로 보존한다.
-- session_id가 NULL인 사건은 건수·사용자 집계에는 포함하지만 세션 퍼널에는 포함하지 않는다.
ALTER TABLE "skill_events" ALTER COLUMN "session_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "skill_events" ADD COLUMN "source_audit_log_id" text;
--> statement-breakpoint
ALTER TABLE "skill_events" ADD CONSTRAINT "skill_events_source_audit_log_id_mcp_audit_logs_id_fk"
  FOREIGN KEY ("source_audit_log_id") REFERENCES "public"."mcp_audit_logs"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "skill_events_source_audit_idx"
  ON "skill_events" USING btree ("source_audit_log_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_events_source_skill_action_uidx"
  ON "skill_events" USING btree ("source_audit_log_id", "skill_id", "action")
  WHERE "source_audit_log_id" IS NOT NULL;
