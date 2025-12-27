CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('skill', 'agent', 'prompt', 'command', 'guide');--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "item_type" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"author" text DEFAULT 'unknown' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"difficulty" "difficulty",
	"plugin_id" text,
	"estimated_time" text,
	"dependencies" text[] DEFAULT '{}',
	"content" text NOT NULL,
	"readme" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
