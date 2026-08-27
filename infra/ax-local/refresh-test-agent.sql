-- 기존 gpters_ax_local 격리 DB에 테스트 에이전트용 스킬과 로컬 전용 토큰을 맞춘다.
-- 운영 DB에 실행하지 않는다. local-* 합성 레코드만 변경한다.
BEGIN;

UPDATE catalog_items
SET
  name = '격리 테스트 에이전트 검증',
  description = '컨테이너 안에서 상태 레코드를 정규화하고 결과를 자체 검증하는 로컬 전용 스킬',
  content = '# AX_LOCAL_TEST_SKILL

입력 레코드의 done 값을 기준으로 완료/대기 건수를 계산하고 JSON 산출물을 만든다.
산출물의 전체 건수와 완료+대기 합계가 일치하는지 검증한 뒤 실행 결과를 보고한다.',
  updated_at = now()
WHERE id = 'local-skill-60';

UPDATE oauth_access_tokens
SET
  token_hash = '0acecfa182b31b57acc6e869261ce8bbe9752ca19f102ddd7d7bb16a0c5cb72e',
  expires_at = now() + interval '30 days',
  is_active = true
WHERE id = 'local-token-user-05';

COMMIT;
