CREATE TYPE "public"."version_type" AS ENUM('major', 'minor', 'patch');--> statement-breakpoint
CREATE TABLE "item_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"version" text NOT NULL,
	"version_type" "version_type" NOT NULL,
	"content" text NOT NULL,
	"changelog" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"snapshot_data" jsonb
);
--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_versions_item_id_idx" ON "item_versions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_versions_version_idx" ON "item_versions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "item_versions_created_at_idx" ON "item_versions" USING btree ("created_at");