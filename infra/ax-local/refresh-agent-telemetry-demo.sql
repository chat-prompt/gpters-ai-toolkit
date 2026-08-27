BEGIN;

DELETE FROM ax_agent_telemetry_batches
WHERE collector_instance_id LIKE 'local-demo-%';

INSERT INTO ax_agent_telemetry_batches (
  batch_id, schema_version, agent_id, collector_instance_id, runtime,
  window_start, window_end, collected_at,
  input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
  thinking_tokens, thinking_tokens_relation, sessions, turns,
  models, tools, skill_loads, task_categories, executions, collection
)
SELECT
  batch_id, '1.0.0', agent_id, 'local-demo-' || agent_id,
  '{"openclawVersion":"2026.7.1-2","claudeCliVersion":"2.1.246","collectorVersion":"0.1.0"}'::jsonb,
  now() - interval '6 hours', now() - interval '1 hour', now() - interval '55 minutes',
  input_tokens, output_tokens, cache_creation, cache_read, thinking, 'included-in-output', sessions, turns,
  jsonb_build_array(jsonb_build_object(
    'model', 'claude-opus-5', 'turns', turns,
    'usage', jsonb_build_object(
      'inputTokens', input_tokens, 'outputTokens', output_tokens,
      'cacheCreationInputTokens', cache_creation, 'cacheReadInputTokens', cache_read,
      'thinkingTokens', thinking, 'thinkingTokensRelation', 'included-in-output'
    )
  )),
  jsonb_build_array(
    jsonb_build_object('name', 'Bash', 'calls', turns - 2, 'failures', 1),
    jsonb_build_object('name', 'Read', 'calls', 2, 'failures', 0)
  ),
  jsonb_build_array(jsonb_build_object('skillId', 'browse', 'loaded', 3, 'failed', 0, 'interrupted', 0)),
  jsonb_build_array(jsonb_build_object(
    'category', category, 'sessions', sessions, 'turns', turns,
    'usage', jsonb_build_object(
      'inputTokens', input_tokens, 'outputTokens', output_tokens,
      'cacheCreationInputTokens', cache_creation, 'cacheReadInputTokens', cache_read,
      'thinkingTokens', thinking, 'thinkingTokensRelation', 'included-in-output'
    )
  )),
  '[{"status":"success","evidence":"verified","count":1}]'::jsonb,
  jsonb_build_object(
    'filesRead', sessions, 'filesReset', 0, 'recordsRead', turns * 12,
    'duplicatesSkipped', turns, 'syntheticSkipped', 2, 'malformedSkipped', 0,
    'outsideWindowSkipped', 0, 'parseFailures', 0, 'lagMinutes', lag
  )
FROM (VALUES
  ('41111111-1111-4111-8111-111111111111', 'bbodoong', 3400, 180000, 900000, 4200000, 70000, 12, 280, 'infra-ops', 3.0),
  ('42222222-2222-4222-8222-222222222222', 'bbojjak', 2200, 90000, 500000, 2200000, 30000, 8, 170, 'study-ops', 5.0),
  ('43333333-3333-4333-8333-333333333333', 'bbosik', 1800, 75000, 420000, 1800000, 22000, 6, 130, 'community-ops', 8.0),
  ('44444444-4444-4444-8444-444444444444', 'bboketer', 1200, 55000, 300000, 1200000, 18000, 4, 90, 'marketing-copy', 12.0)
) AS fixture(batch_id, agent_id, input_tokens, output_tokens, cache_creation, cache_read, thinking, sessions, turns, category, lag);

-- 직전 기간 비교용 한 batch. 현재 합계에는 들어가지 않는다.
INSERT INTO ax_agent_telemetry_batches (
  batch_id, schema_version, agent_id, collector_instance_id, runtime,
  window_start, window_end, collected_at,
  input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
  thinking_tokens, thinking_tokens_relation, sessions, turns,
  models, tools, skill_loads, task_categories, executions, collection
) VALUES (
  '45555555-5555-4555-8555-555555555555', '1.0.0', 'bbodoong', 'local-demo-bbodoong',
  '{"openclawVersion":"2026.7.1-2","claudeCliVersion":"2.1.246","collectorVersion":"0.1.0"}'::jsonb,
  now() - interval '40 days', now() - interval '35 days', now() - interval '35 days',
  1000, 40000, 200000, 800000, 10000, 'included-in-output', 4, 100,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '{"filesRead":4,"filesReset":0,"recordsRead":100,"duplicatesSkipped":5,"syntheticSkipped":0,"malformedSkipped":0,"outsideWindowSkipped":0,"parseFailures":0,"lagMinutes":4}'::jsonb
);

COMMIT;
