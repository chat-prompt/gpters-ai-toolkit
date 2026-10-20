-- Claude 주간 한도 수집 연결 상태 (EDU-11519)
--
-- aitk 0.7.25+ 가 report_usage 마다 상태 표시줄 연결 상태·마지막 자동 연결 결과·한도 수신 시각을 싣는다.
-- 수집기 점검 행에 nullable 컬럼 하나만 더한다. 기존 행은 null 로 남는다.
-- 새 코드는 이 컬럼을 읽고 쓰므로(insert·select 가 컬럼을 나열한다) 코드보다 먼저 적용해야 한다.
-- 옛 코드는 컬럼을 모르므로 먼저 적용해도 안전하다.
ALTER TABLE "ax_usage_collector_state" ADD COLUMN IF NOT EXISTS "limit_capture" jsonb;
