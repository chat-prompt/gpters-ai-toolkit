-- 에이전트 자격증명에 조직 범위 수정 옵션을 더한다 (DEV-4618).
--
-- allow_org_edit = true 인 에이전트는 토큰 조직의 카탈로그 항목을 작성자와 무관하게 수정할 수 있다
-- (deploy_skill·add_files·remove_files). 삭제·소유자 이전·다른 조직 항목은 계속 막는다.
-- 기본값 false 라 기존 자격증명은 지금처럼 토큰 주인이 작성한 항목만 고친다.
--
-- 새 코드는 인증할 때 이 컬럼을 읽으므로 코드 배포보다 먼저 적용한다. 옛 코드는 이 컬럼을 모르므로
-- 먼저 적용해도 안전하다.
ALTER TABLE "aitk_agent_credentials" ADD COLUMN "allow_org_edit" boolean DEFAULT false NOT NULL;
