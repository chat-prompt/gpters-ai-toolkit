-- 0030 이후 실행 시작/완료, 에이전트 식별, 보고 누락을 보여주는 로컬 fixture.
BEGIN;

DELETE FROM ax_skill_execution_attempts
WHERE attempt_id LIKE '10000000-%' OR agent = 'test-agent';

INSERT INTO ax_skill_execution_attempts (
  attempt_id, event_id, session_id, user_id, source, skill_id, skill_version, agent, agent_id,
  status, failure_stage, error_code, validation_method, validation_passed,
  validation_summary, user_accepted, occurred_at, start_observed, started_at, completed_at
)
VALUES
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'local-journey-applied', 'local-user-01', 'aitk', 'local-skill-13', '1.0.0', 'claude-code', 'claude-reviewer', 'success', null, null, 'test', true, '합성 단위 테스트 통과', true, now() - interval '3 hours 35 minutes', true, now() - interval '3 hours 45 minutes', now() - interval '3 hours 35 minutes'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'local-journey-not-applied', 'local-user-02', 'aitk', 'local-skill-14', '1.1.0', 'codex', 'codex-deployer', 'partial', 'dependency', 'RUNTIME_MISSING', 'artifact', false, '일부 산출물만 생성', false, now() - interval '2 hours 35 minutes', true, now() - interval '2 hours 50 minutes', now() - interval '2 hours 35 minutes'),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'local-journey-unreported', 'local-user-01', 'aitk', 'local-skill-15', null, 'claude-code', 'claude-docs', 'failed', 'validation', 'TEST_FAILED', 'test', false, '합성 검증 실패', null, now() - interval '1 hour 35 minutes', false, now() - interval '1 hour 35 minutes', now() - interval '1 hour 35 minutes'),
  ('10000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'local-journey-direct-load', 'local-user-02', 'aitk', 'local-skill-16', '2.0.0', 'codex', 'codex-direct', 'abandoned', 'instruction', null, 'none', null, null, null, now() - interval '35 minutes', false, now() - interval '35 minutes', now() - interval '35 minutes'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'local-journey-applied', 'local-user-01', 'aitk', 'local-skill-13', '1.0.0', 'claude-code', 'claude-reviewer', 'running', null, null, 'none', null, null, null, now() - interval '10 minutes', true, now() - interval '10 minutes', null),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'local-journey-unreported', 'local-user-01', 'bbopters-shared', 'local-skill-15', null, 'claude-code', 'claude-docs', 'running', null, null, 'none', null, null, null, now() - interval '2 hours', true, now() - interval '2 hours', null);

INSERT INTO ax_skill_execution_events (event_id, attempt_id, phase, occurred_at)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'started', now() - interval '3 hours 45 minutes'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'completed', now() - interval '3 hours 35 minutes'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'started', now() - interval '2 hours 50 minutes'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'completed', now() - interval '2 hours 35 minutes'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'completed', now() - interval '1 hour 35 minutes'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'completed', now() - interval '35 minutes'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'started', now() - interval '10 minutes'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'started', now() - interval '2 hours');

COMMIT;
