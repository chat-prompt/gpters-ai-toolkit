-- 이미 생성된 격리 DB에서 구성원별 수집 상태 데모만 다시 맞춘다.
-- 운영 DB에 실행하지 않는다. local-* 합성 레코드만 변경한다.
BEGIN;

INSERT INTO ax_usage_collector_state (
  user_id, member_name, clients, record_count, last_reported_at, updated_at
)
VALUES
  ('local-user-01', '구성원 01', '["claude-code", "codex"]'::jsonb, 2, now() - interval '1 hour', now()),
  ('local-user-02', '구성원 02', '["codex"]'::jsonb, 1, now() - interval '3 hours', now()),
  ('local-user-03', '구성원 03', '["claude-code"]'::jsonb, 0, now() - interval '2 hours', now()),
  ('local-user-04', '구성원 04', '["codex"]'::jsonb, 1, now() - interval '10 days', now())
ON CONFLICT (user_id) DO UPDATE SET
  member_name = EXCLUDED.member_name,
  clients = EXCLUDED.clients,
  record_count = EXCLUDED.record_count,
  last_reported_at = EXCLUDED.last_reported_at,
  updated_at = EXCLUDED.updated_at;

DELETE FROM ax_usage_collector_state
WHERE user_id IN ('local-user-05', 'local-user-06');

INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris)
VALUES (
  'local-client-usage-demo', null, '로컬 수집 상태 데모', '["http://localhost:3002/oauth/callback"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  redirect_uris = EXCLUDED.redirect_uris,
  updated_at = now();

DELETE FROM oauth_access_tokens
WHERE user_id IN ('local-user-05', 'local-user-06')
  AND id <> 'local-token-user-05';

DELETE FROM oauth_refresh_tokens
WHERE user_id IN ('local-user-05', 'local-user-06');

INSERT INTO oauth_access_tokens (
  id, token_hash, client_id, user_id, scope, expires_at, usage_count, is_active
)
VALUES (
  'local-token-user-05', '0acecfa182b31b57acc6e869261ce8bbe9752ca19f102ddd7d7bb16a0c5cb72e', 'local-client-usage-demo',
  'local-user-05', 'mcp', now() + interval '30 days', 0, true
)
ON CONFLICT (id) DO UPDATE SET
  token_hash = EXCLUDED.token_hash,
  expires_at = EXCLUDED.expires_at,
  is_active = true;

COMMIT;
