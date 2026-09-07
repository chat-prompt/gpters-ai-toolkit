-- 카탈로그 위생 지표(중복·미사용)를 매일 찍어 추세로 본다.
-- 카탈로그는 과거 상태를 보존하지 않아 소급 계산이 불가능하므로, 안 찍어두면 영영 추세가 없다.
-- (snapshot_date, item_type) 복합 기본키라 같은 날 재실행은 덮어쓰기로 끝난다.
CREATE TABLE IF NOT EXISTS "ax_catalog_health_snapshots" (
  "snapshot_date" text NOT NULL,
  "item_type" "item_type" NOT NULL,
  "total_items" integer DEFAULT 0 NOT NULL,
  "never_loaded" integer DEFAULT 0 NOT NULL,
  "never_applied" integer DEFAULT 0 NOT NULL,
  "single_user_applied" integer DEFAULT 0 NOT NULL,
  "duplicate_groups" integer DEFAULT 0 NOT NULL,
  "duplicate_items" integer DEFAULT 0 NOT NULL,
  "near_identical_pairs" integer DEFAULT 0 NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ax_catalog_health_snapshots_pkey" PRIMARY KEY("snapshot_date","item_type")
);
