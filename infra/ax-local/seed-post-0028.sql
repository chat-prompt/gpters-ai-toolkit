BEGIN;

INSERT INTO ax_usage_collector_state (
  user_id, member_name, clients, record_count, last_reported_at
)
VALUES
  ('local-user-01', '구성원 01', '["claude-code", "codex"]'::jsonb, 2, now() - interval '1 hour'),
  ('local-user-02', '구성원 02', '["codex"]'::jsonb, 1, now() - interval '3 hours'),
  ('local-user-03', '구성원 03', '["claude-code"]'::jsonb, 0, now() - interval '2 hours'),
  ('local-user-04', '구성원 04', '["codex"]'::jsonb, 1, now() - interval '10 days');

INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris)
VALUES (
  'local-client-usage-demo', null, '로컬 수집 상태 데모', '["http://localhost:3002/oauth/callback"]'::jsonb
);

INSERT INTO oauth_access_tokens (
  id, token_hash, client_id, user_id, scope, expires_at, usage_count, is_active
)
VALUES (
  'local-token-user-05', '0acecfa182b31b57acc6e869261ce8bbe9752ca19f102ddd7d7bb16a0c5cb72e', 'local-client-usage-demo',
  'local-user-05', 'mcp', now() + interval '30 days', 0, true
);

UPDATE org_memberships
SET
  status = 'offboarded',
  ended_at = now() - interval '1 day',
  deactivated_by = 'local-user-01',
  deactivation_reason = '격리 환경 퇴사 처리 검증'
WHERE user_id = 'local-user-21' AND org_id = 'local-org-gpters';

UPDATE users
SET
  account_status = 'suspended',
  deactivated_at = now() - interval '1 day',
  deactivation_reason = '격리 환경 퇴사 처리 검증'
WHERE id = 'local-user-21';

COMMIT;
