-- 에이전트 텔레메트리 수집기는 상시 가동 에이전트가 기본이라 수집 주기 기본값을 1시간으로 맞춘다.
-- 노트북에서 도는 에이전트는 설치 시 --interval로 늘린다. 기존 행은 바꾸지 않는다.
ALTER TABLE "ax_agent_telemetry_collectors" ALTER COLUMN "interval_seconds" SET DEFAULT 3600;
