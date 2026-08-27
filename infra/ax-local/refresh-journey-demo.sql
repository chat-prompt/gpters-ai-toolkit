-- 탐색 퍼널의 적용·미적용·기록 없음과 검색 외 직접 로드를 함께 보여주는 로컬 fixture.
-- 운영 DB에 실행하지 않는다. local-journey-* 레코드만 다시 만든다.
BEGIN;

DELETE FROM skill_events WHERE id LIKE 'local-journey-%';
DELETE FROM mcp_audit_logs WHERE id LIKE 'local-journey-%';
DELETE FROM mcp_sessions WHERE session_id LIKE 'local-journey-%';

INSERT INTO mcp_sessions (
  session_id, user_id, client_type, client_name, started_at, last_activity_at,
  total_requests, success_count, tool_counts, status
)
VALUES
  ('local-journey-applied', 'local-user-01', 'claude-code', 'Claude Code', now() - interval '4 hours', now() - interval '3 hours 30 minutes', 3, 3, '{"semantic_search":1,"get_plugin_content":1,"report_skill_outcome":1}'::jsonb, 'finalized'),
  ('local-journey-not-applied', 'local-user-02', 'codex', 'Codex', now() - interval '3 hours', now() - interval '2 hours 30 minutes', 3, 3, '{"semantic_search":1,"get_plugin_content":1,"report_skill_outcome":1}'::jsonb, 'finalized'),
  ('local-journey-unreported', 'local-user-01', 'claude-code', 'Claude Code', now() - interval '2 hours', now() - interval '1 hour 40 minutes', 2, 2, '{"semantic_search":1,"get_plugin_content":1}'::jsonb, 'finalized'),
  ('local-journey-direct-load', 'local-user-02', 'codex', 'Codex', now() - interval '1 hour', now() - interval '40 minutes', 2, 2, '{"get_plugin_content":1,"report_skill_outcome":1}'::jsonb, 'finalized');

INSERT INTO skill_events (
  id, session_id, user_id, skill_id, action, query, context, rank, score, created_at
)
VALUES
  ('local-journey-search-applied', 'local-journey-applied', 'local-user-01', 'local-skill-13', 'search', '회의록 요약', null, 1, 0.91, now() - interval '3 hours 55 minutes'),
  ('local-journey-load-applied', 'local-journey-applied', 'local-user-01', 'local-skill-13', 'load', null, null, null, null, now() - interval '3 hours 50 minutes'),
  ('local-journey-apply-applied', 'local-journey-applied', 'local-user-01', 'local-skill-13', 'apply', null, '요약 작성에 적용', null, null, now() - interval '3 hours 40 minutes'),
  ('local-journey-search-not-applied', 'local-journey-not-applied', 'local-user-02', 'local-skill-14', 'search', '배포 점검', null, 1, 0.87, now() - interval '2 hours 55 minutes'),
  ('local-journey-load-not-applied', 'local-journey-not-applied', 'local-user-02', 'local-skill-14', 'load', null, null, null, null, now() - interval '2 hours 50 minutes'),
  ('local-journey-skip-not-applied', 'local-journey-not-applied', 'local-user-02', 'local-skill-14', 'skip', null, '필요한 런타임이 없어 미적용', null, null, now() - interval '2 hours 40 minutes'),
  ('local-journey-search-unreported', 'local-journey-unreported', 'local-user-01', 'local-skill-15', 'search', '문서 검토', null, 1, 0.82, now() - interval '1 hour 55 minutes'),
  ('local-journey-load-unreported', 'local-journey-unreported', 'local-user-01', 'local-skill-15', 'load', null, null, null, null, now() - interval '1 hour 50 minutes'),
  ('local-journey-load-direct', 'local-journey-direct-load', 'local-user-02', 'local-skill-16', 'load', null, null, null, null, now() - interval '55 minutes'),
  ('local-journey-apply-direct', 'local-journey-direct-load', 'local-user-02', 'local-skill-16', 'apply', null, '직접 지정해 적용', null, null, now() - interval '45 minutes');

INSERT INTO mcp_audit_logs (
  id, method, tool, is_authenticated, ip_hash, request_params, response_status,
  response_time, session_id, search_results, client_type, created_at
)
VALUES
  ('local-journey-audit-applied', 'tools/call', 'semantic_search', true, 'local-only', '{"query":"회의록 요약"}'::jsonb, 'success', 20, 'local-journey-applied', '[{"id":"local-skill-13"}]'::jsonb, 'claude-code', now() - interval '3 hours 55 minutes'),
  ('local-journey-audit-not-applied', 'tools/call', 'semantic_search', true, 'local-only', '{"query":"배포 점검"}'::jsonb, 'success', 20, 'local-journey-not-applied', '[{"id":"local-skill-14"}]'::jsonb, 'codex', now() - interval '2 hours 55 minutes'),
  ('local-journey-audit-unreported', 'tools/call', 'semantic_search', true, 'local-only', '{"query":"문서 검토"}'::jsonb, 'success', 20, 'local-journey-unreported', '[{"id":"local-skill-15"}]'::jsonb, 'claude-code', now() - interval '1 hour 55 minutes');

COMMIT;
