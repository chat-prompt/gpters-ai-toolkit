CREATE TYPE "public"."install_method" AS ENUM('cli', 'mcp', 'plugin', 'manual_content', 'manual_folder', 'manual_file');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"method" "install_method" NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installations_item_id_idx" ON "installations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "installations_method_idx" ON "installations" USING btree ("method");--> statement-breakpoint
CREATE INDEX "installations_created_at_idx" ON "installations" USING btree ("created_at");