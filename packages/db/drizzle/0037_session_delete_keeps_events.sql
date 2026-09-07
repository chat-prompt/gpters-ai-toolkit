-- 세션이 지워져도 스킬 이벤트·실행 시도는 남긴다.
--
-- `mcp_sessions`는 90일 보관이고 `finalize-sessions` 크론이 매일 정리한다. 그런데 두 자식 테이블이
-- `on delete cascade`라, 세션이 지워질 때 "누가 언제 무슨 스킬을 열었나"라는 사건까지 같이 사라졌다.
-- 그 사건은 365일 잔디와 미사용·중복 판정의 원천이라 세션보다 오래 살아야 한다.
--
-- 실제 손실이 확인됐다: `skill_events`는 2026-03-11(0017)에 생겼는데 살아 있는 가장 오래된 행이
-- 2026-06-08이다. 대조군인 `mcp_audit_logs`(캐스케이드 없음)는 2025-12-29부터 남아 있다.
--
-- `session_id`는 이미 nullable이고(0032, 세션 없는 CLI 보고), 지표 코드도
-- `coalesce(journey_id, session_id)`로 세션 없는 행을 다룬다. 그래서 `set null`이 안전하다 —
-- 세션이 사라진 행은 삭제되는 대신 "연결 불가"가 된다. 미관측과 0을 구분하는 원칙과도 맞는다.
--
-- 제약조건 이름을 가정하지 않는다. 운영에는 drizzle이 붙인 이름(`skill_events_session_id_
-- mcp_sessions_session_id_fk`)과 Postgres 기본 이름(`ax_skill_execution_attempts_session_id_fkey`)이
-- 섞여 있다. 이름을 틀리게 적으면 DROP IF EXISTS가 조용히 넘어가고 CASCADE가 그대로 남는다.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.conname, c.conrelid::regclass::text AS child
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.mcp_sessions'::regclass
      AND c.conrelid IN ('public.skill_events'::regclass, 'public.ax_skill_execution_attempts'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target.child, target.conname);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "skill_events"
  ADD CONSTRAINT "skill_events_session_id_mcp_sessions_session_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."mcp_sessions"("session_id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ax_skill_execution_attempts"
  ADD CONSTRAINT "ax_skill_execution_attempts_session_id_mcp_sessions_session_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."mcp_sessions"("session_id")
  ON DELETE set null ON UPDATE no action;
