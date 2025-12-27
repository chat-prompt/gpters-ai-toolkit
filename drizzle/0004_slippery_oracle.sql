ALTER TYPE "public"."item_type" ADD VALUE 'hook';--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "files" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "hook_event" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "hook_matcher" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "hook_command" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "hook_timeout" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "hook_blocking" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "status" text DEFAULT 'published';--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "changelog" text;--> statement-breakpoint
CREATE INDEX "catalog_items_type_idx" ON "catalog_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "catalog_items_status_idx" ON "catalog_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_items_author_idx" ON "catalog_items" USING btree ("author");--> statement-breakpoint
CREATE INDEX "catalog_items_marketplace_enabled_idx" ON "catalog_items" USING btree ("marketplace_enabled");--> statement-breakpoint
CREATE INDEX "catalog_items_type_status_idx" ON "catalog_items" USING btree ("type","status");