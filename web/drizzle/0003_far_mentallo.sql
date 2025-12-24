CREATE TYPE "public"."team_tag" AS ENUM('platform', 'ai', 'data', 'product', 'infra', 'general');--> statement-breakpoint
CREATE TABLE "authors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "catalog_item_tags" (
	"item_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "catalog_item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"documentation_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'bg-gray-100 text-gray-800' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."item_type";--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('skill', 'agent', 'command', 'guide');--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "type" SET DATA TYPE "public"."item_type" USING "type"::"public"."item_type";--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "team_tag" "team_tag" DEFAULT 'general';--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "allowed_tools" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "agent_model" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "agent_permission_mode" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "agent_skills" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "command_argument_hint" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "command_disable_model_invocation" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "catalog_item_tags" ADD CONSTRAINT "catalog_item_tags_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_tags" ADD CONSTRAINT "catalog_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;