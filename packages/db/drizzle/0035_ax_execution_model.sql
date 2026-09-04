-- 실행 보고에 모델을 담을 자리를 연다. 보고자가 밝힌 값만 들어가고, 미보고는 NULL로 남는다.
-- 텔레메트리 배치의 models 집계로 역추정해 채우지 않는다 (그건 실측이 아니라 추정이다).
ALTER TABLE "ax_skill_execution_attempts" ADD COLUMN "model" text;
