-- AX 대시보드: 팀원별 구독 현황 테이블
-- 결제내역 트래커 시트가 정본이고, 이 테이블은 대시보드가 읽는 사본이다.
-- 갱신: pnpm --filter @gpters/db exec tsx scripts/import-ax-subscriptions.ts <csv>

DO $$ BEGIN
  CREATE TYPE "ax_billing_cycle" AS ENUM ('monthly', 'yearly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "ax_subscription_status" AS ENUM ('active', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ax_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "vendor" text NOT NULL,
  "plan" text NOT NULL,
  "owner_name" text,
  "renewal_day" integer,
  "payer" text,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'KRW',
  "billing_cycle" "ax_billing_cycle" NOT NULL DEFAULT 'monthly',
  "status" "ax_subscription_status" NOT NULL DEFAULT 'active',
  "note" text,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_subscriptions_vendor_idx" ON "ax_subscriptions" ("vendor");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_subscriptions_status_idx" ON "ax_subscriptions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_subscriptions_owner_name_idx" ON "ax_subscriptions" ("owner_name");
