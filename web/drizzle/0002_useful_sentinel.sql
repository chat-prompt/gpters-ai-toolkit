ALTER TABLE "catalog_items" ADD COLUMN "marketplace_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "marketplace_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "marketplace_version" text DEFAULT '1.0.0';