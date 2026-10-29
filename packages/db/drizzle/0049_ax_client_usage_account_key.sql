-- 개인 사용 보고의 계정 키 (EDU-11835)
--
-- aitk 개인 사용 보고가 그 클라이언트의 로그인 계정 이메일 해시(sha256(lower(trim(email))))를 실어 오면 남긴다.
-- 공용·서포트 구독의 account_key(0047)와 같은 해시라, 공용 계정을 개인이 쓴 사용을 초기화 시각 근사 없이 계정으로 짝짓는다.
-- 원문 이메일은 저장하지 않는다. nullable 컬럼 하나와 형식 CHECK 만 더하고 기존 행은 null 로 남는다(옛 aitk 보고).
-- 새 코드는 insert 에 이 컬럼을 나열하므로 코드보다 먼저 적용해야 한다. 옛 코드는 모르므로 먼저 적용해도 안전하다.
ALTER TABLE "ax_client_usage" ADD COLUMN IF NOT EXISTS "account_key" text;
--> statement-breakpoint

-- 이미 있으면 건너뛴다 (ADD CONSTRAINT 는 IF NOT EXISTS 를 받지 않는다)
DO $$ BEGIN
  ALTER TABLE "ax_client_usage"
    ADD CONSTRAINT "ax_client_usage_account_key_check" CHECK ("account_key" ~ '^[a-f0-9]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
