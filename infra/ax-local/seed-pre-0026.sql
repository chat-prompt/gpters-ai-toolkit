BEGIN;

INSERT INTO organizations (id, name, slug, allowed_domains, description, is_active)
VALUES (
  'local-org-gpters',
  'GPTers Local',
  'gpters',
  '["gpters.org"]'::jsonb,
  'AX isolated local fixture',
  true
);

INSERT INTO users (id, email, name, role, last_login_at)
SELECT
  'local-user-' || lpad(member::text, 2, '0'),
  'member' || lpad(member::text, 2, '0') || '@gpters.org',
  '구성원 ' || lpad(member::text, 2, '0'),
  CASE WHEN member = 1 THEN 'super_admin'::user_role ELSE 'viewer'::user_role END,
  now() - make_interval(days => member % 7)
FROM generate_series(1, 21) AS member;

INSERT INTO org_memberships (user_id, org_id, role, joined_at)
SELECT
  'local-user-' || lpad(member::text, 2, '0'),
  'local-org-gpters',
  CASE WHEN member = 1 THEN 'org_admin'::org_role ELSE 'org_viewer'::org_role END,
  now() - interval '180 days'
FROM generate_series(1, 21) AS member;

INSERT INTO catalog_items (
  id, type, name, description, content, status, author_id, org_id, visibility, created_at, updated_at
)
SELECT
  'local-skill-' || lpad(skill::text, 2, '0'),
  'skill'::item_type,
  '로컬 스킬 ' || lpad(skill::text, 2, '0'),
  '격리 환경 검증용 합성 스킬',
  '# Local skill fixture',
  'published',
  'local-user-01',
  'local-org-gpters',
  'public'::visibility,
  now() - make_interval(days => 90 - skill),
  now() - make_interval(days => skill % 14)
FROM generate_series(1, 60) AS skill;

UPDATE catalog_items
SET
  name = '격리 테스트 에이전트 검증',
  description = '컨테이너 안에서 상태 레코드를 정규화하고 결과를 자체 검증하는 로컬 전용 스킬',
  content = '# AX_LOCAL_TEST_SKILL

입력 레코드의 done 값을 기준으로 완료/대기 건수를 계산하고 JSON 산출물을 만든다.
산출물의 전체 건수와 완료+대기 합계가 일치하는지 검증한 뒤 실행 결과를 보고한다.'
WHERE id = 'local-skill-60';

INSERT INTO mcp_sessions (
  session_id, user_id, client_type, client_name, started_at, last_activity_at,
  total_requests, success_count, tool_counts, status
)
SELECT
  'local-session-' || session,
  'local-user-' || lpad((((session - 1) % 2) + 1)::text, 2, '0'),
  CASE WHEN session % 2 = 0 THEN 'codex' ELSE 'claude-code' END,
  CASE WHEN session % 2 = 0 THEN 'Codex' ELSE 'Claude Code' END,
  now() - make_interval(days => session % 7, hours => session),
  now() - make_interval(days => session % 7, hours => session - 1),
  10,
  10,
  '{"semantic_search": 5, "get_plugin_content": 2}'::jsonb,
  'finalized'::session_status
FROM generate_series(1, 9) AS session;

INSERT INTO skill_events (
  id, session_id, user_id, skill_id, action, query, rank, score, created_at
)
SELECT
  'local-search-' || event,
  'local-session-' || (((event - 1) % 9) + 1),
  'local-user-' || lpad((((event - 1) % 2) + 1)::text, 2, '0'),
  'local-skill-' || lpad((((event - 1) % 12) + 1)::text, 2, '0'),
  'search'::skill_event_action,
  '로컬 검색어 ' || (((event - 1) % 8) + 1),
  ((event - 1) % 5) + 1,
  0.5 + ((event % 4)::real / 10),
  now() - make_interval(days => event % 7, mins => event)
FROM generate_series(1, 49) AS event;

INSERT INTO skill_events (
  id, session_id, user_id, skill_id, action, created_at
)
SELECT
  'local-load-' || event,
  'local-session-' || (((event - 1) % 9) + 1),
  'local-user-' || lpad((((event - 1) % 2) + 1)::text, 2, '0'),
  'local-skill-' || lpad((((event - 1) % 8) + 1)::text, 2, '0'),
  'load'::skill_event_action,
  now() - make_interval(days => event % 7, mins => event - 60)
FROM generate_series(1, 18) AS event;

INSERT INTO skill_events (
  id, session_id, user_id, skill_id, action, context, created_at
)
SELECT
  'local-apply-' || event,
  'local-session-' || (((event - 1) % 7) + 1),
  'local-user-' || lpad((((event - 1) % 2) + 1)::text, 2, '0'),
  'local-skill-' || lpad((((event - 1) % 7) + 1)::text, 2, '0'),
  'apply'::skill_event_action,
  '합성 fixture 적용 보고',
  now() - make_interval(days => event % 7, mins => event - 120)
FROM generate_series(1, 7) AS event;

INSERT INTO skill_events (
  id, session_id, user_id, skill_id, action, query, context, created_at
)
VALUES
  ('local-skip-search-1', 'local-session-8', 'local-user-02', 'local-skill-09', 'skip',
   '문서 자동화', '현재 작업과 관련성이 낮음', now() - interval '2 days'),
  ('local-skip-search-2', 'local-session-9', 'local-user-01', 'local-skill-10', 'skip',
   '배포 점검', '이미 알고 있는 방법을 사용함', now() - interval '1 day'),
  ('local-skip-outcome-1', 'local-session-8', 'local-user-02', 'local-skill-08', 'skip',
   null, '필요한 의존성이 없어 미적용', now() - interval '12 hours');

INSERT INTO mcp_audit_logs (
  id, method, tool, is_authenticated, ip_hash, request_params, response_status,
  response_time, session_id, search_results, client_type, created_at
)
SELECT
  'local-audit-' || event,
  'tools/call',
  'semantic_search',
  true,
  'local-only',
  jsonb_build_object('query', '로컬 검색어 ' || (((event - 1) % 8) + 1)),
  'success',
  20 + event,
  'local-session-' || (((event - 1) % 9) + 1),
  CASE
    WHEN event IN (4, 11) THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object('id', 'local-skill-' || lpad((((event - 1) % 12) + 1)::text, 2, '0')))
  END,
  CASE WHEN event % 2 = 0 THEN 'codex' ELSE 'claude-code' END,
  now() - make_interval(days => event % 7, mins => event)
FROM generate_series(1, 12) AS event;

INSERT INTO ax_client_usage (
  id, member_name, client, plan, period_start, period_end,
  input_tokens, output_tokens, cached_tokens, sessions, models, synced_at, updated_at
)
VALUES
  ('local-usage-name-old', '구성원 01', 'claude-code', 'Claude Max',
   date_trunc('week', now()), now(), 120000, 18000, 90000, 4,
   '{"claude-opus": 228000}'::jsonb, now() - interval '2 hours', now() - interval '2 hours'),
  ('local-usage-email-new', 'member01', 'claude-code', 'Claude Max',
   date_trunc('week', now()), now(), 150000, 22000, 110000, 5,
   '{"claude-opus": 282000}'::jsonb, now() - interval '1 hour', now() - interval '1 hour'),
  ('local-usage-codex-1', 'member01', 'codex', 'ChatGPT Pro',
   date_trunc('week', now()), now(), 90000, 14000, 70000, 3,
   '{"gpt-5": 174000}'::jsonb, now() - interval '1 hour', now() - interval '1 hour'),
  ('local-usage-codex-2', '구성원 02', 'codex', 'ChatGPT Plus',
   date_trunc('week', now()), now(), 50000, 9000, 30000, 2,
   '{"gpt-5": 89000}'::jsonb, now() - interval '3 hours', now() - interval '3 hours');

INSERT INTO ax_subscriptions (
  id, vendor, plan, owner_name, renewal_day, payer, amount, currency, billing_cycle, status, note
)
VALUES
  ('local-sub-1', 'Anthropic', 'Claude Max', '구성원 01', 5, '회사', 200, 'USD', 'monthly', 'active', '합성 fixture'),
  ('local-sub-2', 'OpenAI', 'ChatGPT Pro', '구성원 01', 12, '회사', 200, 'USD', 'monthly', 'active', '합성 fixture'),
  ('local-sub-3', 'OpenAI', 'ChatGPT Plus', '구성원 02', 21, '회사', 20, 'USD', 'monthly', 'active', '합성 fixture');

COMMIT;
